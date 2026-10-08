use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    process::Stdio,
    sync::atomic::{AtomicU64, Ordering},
};
use tokio::{
    io::{AsyncRead, AsyncWrite},
    process::{Child, ChildStdin, ChildStdout, Command},
    sync::{Mutex, RwLock},
    time::{timeout, Duration},
};
use tokio_tungstenite::{client_async, tungstenite::Message, WebSocketStream};

const DEFAULT_REQUEST_TIMEOUT: Duration = Duration::from_secs(8);
const DAEMON_START_TIMEOUT: Duration = Duration::from_secs(30);
const GRACEFUL_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(2);
const MIN_CLI_VERSION: (u64, u64, u64) = (0, 157, 0);
// 此 URL 仅用于经过本地 proxy 的 WebSocket 握手，不建立 TCP 连接。
const PROXY_HANDSHAKE_URL: &str = "ws://localhost/";

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

type ProxySocket = WebSocketStream<tokio::io::Join<ChildStdout, ChildStdin>>;

/// child 仅为 Desk 的字节代理，daemon 的进程不属于此连接。
struct CodexAppServer {
    child: Child,
    socket: ProxySocket,
}

/// 账户、会话交互和后台统计分别使用一条连接，避免后台读取阻塞首页刷新。
/// 每条连接内按 ID 收集响应；三条连接共享同一个本机 daemon。
pub struct AppServerState {
    account: Mutex<Option<CodexAppServer>>,
    threads: Mutex<Option<CodexAppServer>>,
    background: Mutex<Option<CodexAppServer>>,
    /// 请求持有读锁，切换 CLI 或退出持有写锁，避免关闭期间又建立新连接。
    cli_path: RwLock<Option<PathBuf>>,
    /// 多条连接首次启动或重连时，串行执行 daemon start，避免同时安装/启动。
    daemon_start: Mutex<()>,
    next_request_id: AtomicU64,
}

impl Default for AppServerState {
    fn default() -> Self {
        Self {
            account: Mutex::new(None),
            threads: Mutex::new(None),
            background: Mutex::new(None),
            cli_path: RwLock::new(None),
            daemon_start: Mutex::new(()),
            next_request_id: AtomicU64::new(2),
        }
    }
}

impl AppServerState {
    /// 登录独立于共享 daemon，临时目录避免授权覆盖用户正在使用的凭据。
    pub async fn login_process(&self, home: &Path) -> Result<Child, String> {
        let cli_path = self.cli_path.read().await;
        let mut command = cli_command(
            cli_path.as_deref(),
            &[
                "app-server",
                "--listen",
                "stdio://",
                "-c",
                "cli_auth_credentials_store=\"file\"",
                "-c",
                "analytics.enabled=false",
                "-c",
                "otel.exporter=\"none\"",
            ],
        );
        command.env("CODEX_HOME", home).current_dir(home);
        for key in [
            "OPENAI_API_KEY",
            "CODEX_API_KEY",
            "CODEX_ACCESS_TOKEN",
            "OPENAI_BASE_URL",
        ] {
            command.env_remove(key);
        }
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            command.as_std_mut().process_group(0);
        }
        command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .spawn()
            .map_err(|_| "无法启动登录，请检查设置中的 Codex CLI 路径".into())
    }

    /// 先预热首页账户通道，其他通道在首次请求时按需连接。
    pub async fn warm_up(&self) -> Result<(), String> {
        let cli_path = self.cli_path.read().await;
        let mut connection = self.account.lock().await;
        self.ensure_connection(&mut connection, cli_path.as_deref())
            .await
    }

    pub async fn request(&self, method: &str, params: Value) -> Result<Value, String> {
        self.request_with_timeout(method, params, DEFAULT_REQUEST_TIMEOUT)
            .await
    }

    pub async fn request_with_timeout(
        &self,
        method: &str,
        params: Value,
        response_timeout: Duration,
    ) -> Result<Value, String> {
        let cli_path = self.cli_path.read().await;
        let channel = if method.starts_with("account/") {
            &self.account
        } else {
            &self.threads
        };
        let mut connection = channel.lock().await;
        self.request_locked(
            &mut connection,
            cli_path.as_deref(),
            method,
            params,
            response_timeout,
        )
        .await
    }

    pub async fn request_background(&self, method: &str, params: Value) -> Result<Value, String> {
        let cli_path = self.cli_path.read().await;
        let mut connection = self.background.lock().await;
        self.request_locked(
            &mut connection,
            cli_path.as_deref(),
            method,
            params,
            DEFAULT_REQUEST_TIMEOUT,
        )
        .await
    }

    /// 后台批次使用独立连接，响应顺序可以与请求顺序不同。
    pub async fn request_background_batch(
        &self,
        requests: Vec<(String, Value)>,
    ) -> Result<Vec<Result<Value, String>>, String> {
        if requests.is_empty() {
            return Ok(Vec::new());
        }
        let cli_path = self.cli_path.read().await;
        let mut connection = self.background.lock().await;
        self.ensure_connection(&mut connection, cli_path.as_deref())
            .await?;
        let requests = requests
            .into_iter()
            .map(|(method, params)| {
                (
                    self.next_request_id.fetch_add(1, Ordering::Relaxed),
                    method,
                    params,
                )
            })
            .collect::<Vec<_>>();
        let result = connection
            .as_mut()
            .expect("已建立 daemon 连接")
            .request_batch(&requests, DEFAULT_REQUEST_TIMEOUT)
            .await;
        if result.is_err() {
            if let Some(server) = connection.take() {
                server.close().await;
            }
        }
        result
    }

    async fn ensure_connection(
        &self,
        connection: &mut Option<CodexAppServer>,
        cli_path: Option<&Path>,
    ) -> Result<(), String> {
        if connection.is_none() {
            {
                let _start_guard = self.daemon_start.lock().await;
                start_daemon(cli_path).await?;
            }
            *connection = Some(CodexAppServer::connect(cli_path).await?);
        }
        Ok(())
    }

    async fn request_locked(
        &self,
        connection: &mut Option<CodexAppServer>,
        cli_path: Option<&Path>,
        method: &str,
        params: Value,
        response_timeout: Duration,
    ) -> Result<Value, String> {
        self.ensure_connection(connection, cli_path).await?;
        let id = self.next_request_id.fetch_add(1, Ordering::Relaxed);
        let result = connection
            .as_mut()
            .expect("已建立 daemon 连接")
            .request(id, method, params, response_timeout)
            .await;
        // 业务错误（例如会话不存在）不破坏连接；超时或传输错误才触发下次重连。
        if matches!(&result, Err(RpcError::Transport(_))) {
            if let Some(server) = connection.take() {
                server.close().await;
            }
        }
        result.map_err(RpcError::into_message)
    }

    /// 只断开 Desk 的 WebSocket 并回收自己的 proxy，绝不停止共享 daemon。
    pub async fn shutdown(&self) {
        let _lifecycle_guard = self.cli_path.write().await;
        self.close_connections().await;
    }

    pub async fn configure_cli_path(&self, cli_path: Option<PathBuf>) {
        let mut configured = self.cli_path.write().await;
        self.close_connections().await;
        // 切换可执行文件不重启 daemon，避免中断其他客户端正在进行的工作。
        *configured = cli_path;
    }

    /// 切换持有生命周期写锁：等待所有在途 RPC 完成，再替换凭据。
    /// 只有用户显式选择重启，才停止共享 daemon；默认仅回收 Desk 自己的连接。
    pub async fn apply_auth_change(
        &self,
        store: crate::account_store::AccountStore,
        id: String,
        restart: bool,
    ) -> Result<String, String> {
        let cli_path = self.cli_path.write().await;
        store.validate_target(&id)?;
        if restart {
            read_cli_version_from(cli_path.as_deref())
                .await
                .map_err(|_| "无法启动所选 Codex CLI，登录信息未切换")?;
        }
        self.close_connections().await;
        if restart {
            run_auth_daemon_command(cli_path.as_deref(), "stop")
                .await
                .map_err(|_| "Codex 服务未能退出，登录信息未切换；请结束任务后重试")?;
        }
        let committed = tauri::async_runtime::spawn_blocking(move || store.activate(&id))
            .await
            .unwrap_or_else(|_| Err("账户保存任务中断，请检查当前登录状态".into()));
        if let Err(error) = committed {
            if restart {
                // 替换失败时尝试恢复原服务；不回滚可能已经轮换的凭据。
                if run_auth_daemon_command(cli_path.as_deref(), "start")
                    .await
                    .is_err()
                {
                    return Err(format!("{error}；Codex 服务需要手动启动"));
                }
            }
            return Err(error);
        }
        if !restart {
            return Ok("notRequested".into());
        }
        // 写入已经完成，启动失败属于部分成功，不能报告成凭据未切换。
        Ok(if run_auth_daemon_command(cli_path.as_deref(), "start")
            .await
            .is_ok()
        {
            "restarted"
        } else {
            "startFailed"
        }
        .into())
    }

    async fn close_connections(&self) {
        for channel in [&self.account, &self.threads, &self.background] {
            if let Some(server) = channel.lock().await.take() {
                server.close().await;
            }
        }
    }
}

async fn run_auth_daemon_command(cli_path: Option<&Path>, operation: &str) -> Result<(), String> {
    let mut command = cli_command(cli_path, &["app-server", "daemon", operation]);
    let status = timeout(
        DAEMON_START_TIMEOUT,
        command
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .status(),
    )
    .await
    .map_err(|_| "Codex 服务操作超时")?
    .map_err(|_| "无法执行 Codex 服务操作")?;
    if !status.success() {
        return Err("Codex 服务操作失败".into());
    }
    Ok(())
}

/// daemon start 自身负责复用已运行的服务；不启用远程访问，也不更改用户配置。
async fn start_daemon(cli_path: Option<&Path>) -> Result<(), String> {
    read_cli_version_from(cli_path).await?;
    let mut command = cli_command(cli_path, &["app-server", "daemon", "start"]);
    let output = timeout(
        DAEMON_START_TIMEOUT,
        command.stdin(Stdio::null()).kill_on_drop(true).output(),
    )
    .await
    .map_err(|_| "启动 Codex 共享 daemon 超时，请检查 codex app-server daemon version".to_owned())?
    .map_err(|error| format!("无法启动 Codex 共享 daemon：{error}"))?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_owned();
        return Err(format!(
            "启动 Codex 共享 daemon 失败：{}",
            if detail.is_empty() {
                String::from_utf8_lossy(&output.stdout).trim().to_owned()
            } else {
                detail
            }
        ));
    }
    Ok(())
}

fn validate_cli_version(version: &str) -> Result<(), String> {
    let parsed = version.split_whitespace().find_map(|part| {
        let mut components = part.split(['.', '-']);
        Some((
            components.next()?.parse::<u64>().ok()?,
            components.next()?.parse::<u64>().ok()?,
            components.next()?.parse::<u64>().ok()?,
        ))
    });
    match parsed {
        Some(value) if value >= MIN_CLI_VERSION => Ok(()),
        Some(_) => Err(format!(
            "Codex Desk 需要 Codex CLI ≥ 0.157.0，当前为 {version}，请升级 CLI"
        )),
        None => Err(format!("无法识别 Codex CLI 版本：{version}")),
    }
}

/// 将用户输入规范化为现有文件；空值表示继续使用系统 PATH。
pub fn normalize_cli_path(cli_path: &str) -> Result<Option<PathBuf>, String> {
    let cli_path = cli_path.trim();
    if cli_path.is_empty() {
        return Ok(None);
    }
    let unquoted = cli_path
        .strip_prefix('"')
        .and_then(|value| value.strip_suffix('"'))
        .unwrap_or(cli_path);
    let path = PathBuf::from(unquoted);
    let path = if path.is_absolute() {
        path
    } else {
        std::env::current_dir()
            .map_err(|error| format!("无法解析 Codex CLI 路径：{error}"))?
            .join(path)
    };
    if !path
        .metadata()
        .map_err(|error| format!("Codex CLI 路径不可用：{error}"))?
        .is_file()
    {
        return Err("Codex CLI 路径必须指向文件".to_owned());
    }
    Ok(Some(path))
}

fn cli_command(cli_path: Option<&Path>, arguments: &[&str]) -> Command {
    #[cfg(target_os = "windows")]
    let mut command = {
        let executable = cli_path
            .map(Path::to_path_buf)
            .unwrap_or_else(|| PathBuf::from("codex.cmd"));
        let is_script = executable
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| {
                value.eq_ignore_ascii_case("cmd") || value.eq_ignore_ascii_case("bat")
            });
        if is_script {
            let mut command = Command::new("cmd");
            command.args(["/D", "/C"]).arg(executable).args(arguments);
            command
        } else {
            let mut command = Command::new(executable);
            command.args(arguments);
            command
        }
    };
    #[cfg(not(target_os = "windows"))]
    let command = {
        let mut command = Command::new(cli_path.unwrap_or_else(|| Path::new("codex")));
        command.args(arguments);
        command
    };

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    command
}

/// 设置保存前独立读取 CLI 版本，避免切换到无法执行的路径。
pub async fn read_cli_version_from(cli_path: Option<&Path>) -> Result<String, String> {
    let mut command = cli_command(cli_path, &["--version"]);

    let output = timeout(Duration::from_secs(5), command.output())
        .await
        .map_err(|_| "读取 Codex CLI 版本超时".to_owned())?
        .map_err(|error| format!("无法执行 codex --version：{error}"))?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr).trim().to_owned();
        return Err(if detail.is_empty() {
            "codex --version 未能正常执行".to_owned()
        } else {
            detail
        });
    }
    let version = String::from_utf8_lossy(&output.stdout).trim().to_owned();
    validate_cli_version(&version)?;
    Ok(version)
}

impl CodexAppServer {
    async fn connect(cli_path: Option<&Path>) -> Result<Self, String> {
        // proxy 只转发本地 socket 字节，不启动或拥有共享 daemon。
        let mut command = cli_command(cli_path, &["app-server", "proxy"]);
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            command.as_std_mut().process_group(0);
        }
        let mut child = command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .spawn()
            .map_err(|error| format!("无法启动 Codex daemon proxy：{error}"))?;
        let stdin = child.stdin.take().ok_or("无法获取 Codex proxy 输入通道")?;
        let stdout = child.stdout.take().ok_or("无法获取 Codex proxy 输出通道")?;
        // 这里必须执行 HTTP Upgrade，再发送 WebSocket 帧；proxy 不是 JSONL 适配器。
        let handshake = timeout(
            DEFAULT_REQUEST_TIMEOUT,
            client_async(PROXY_HANDSHAKE_URL, tokio::io::join(stdout, stdin)),
        )
        .await;
        let socket = match handshake {
            Ok(Ok((socket, _))) => socket,
            result => {
                close_proxy(child).await;
                return Err(match result {
                    Err(_) => "连接 Codex daemon 的 WebSocket 握手超时".to_owned(),
                    Ok(Err(error)) => format!("连接 Codex daemon 失败：{error}"),
                    Ok(Ok(_)) => unreachable!(),
                });
            }
        };
        let mut server = Self { child, socket };
        let initialize = server
            .request(
                1,
                "initialize",
                json!({
                    "clientInfo": { "name": "codex-desk", "version": env!("CODEX_DESK_VERSION") },
                    "capabilities": { "experimentalApi": true },
                }),
                DEFAULT_REQUEST_TIMEOUT,
            )
            .await;
        if let Err(error) = initialize {
            server.close().await;
            return Err(error.into_message());
        }
        let initialized = timeout(
            DEFAULT_REQUEST_TIMEOUT,
            server.socket.send(Message::Text(
                json!({ "method": "initialized" }).to_string().into(),
            )),
        )
        .await;
        if !matches!(initialized, Ok(Ok(()))) {
            server.close().await;
            return Err("发送 Codex daemon 初始化通知失败".to_owned());
        }
        Ok(server)
    }

    async fn request(
        &mut self,
        id: u64,
        method: &str,
        params: Value,
        response_timeout: Duration,
    ) -> Result<Value, RpcError> {
        timeout(response_timeout, async {
            self.socket
                .send(Message::Text(
                    json!({ "id": id, "method": method, "params": params })
                        .to_string()
                        .into(),
                ))
                .await
                .map_err(|error| RpcError::Transport(format!("发送 {method} 请求失败：{error}")))?;
            loop {
                let message = next_rpc_message(&mut self.socket)
                    .await
                    .map_err(RpcError::Transport)?;
                // 服务端通知/请求和响应共用 WebSocket，不能将其误当作当前 RPC 响应。
                if message.get("method").is_some()
                    || message.get("id").and_then(Value::as_u64) != Some(id)
                {
                    continue;
                }
                return response_result(&message);
            }
        })
        .await
        .map_err(|_| {
            RpcError::Transport(format!(
                "Codex daemon 在 {} 秒内未响应",
                response_timeout.as_secs()
            ))
        })?
    }

    async fn request_batch(
        &mut self,
        requests: &[(u64, String, Value)],
        response_timeout: Duration,
    ) -> Result<Vec<Result<Value, String>>, String> {
        timeout(response_timeout, async {
            for (id, method, params) in requests {
                self.socket
                    .feed(Message::Text(
                        json!({ "id": id, "method": method, "params": params })
                            .to_string()
                            .into(),
                    ))
                    .await
                    .map_err(|error| format!("发送批量请求失败：{error}"))?;
            }
            self.socket
                .flush()
                .await
                .map_err(|error| format!("发送批量请求失败：{error}"))?;
            let ids = requests.iter().map(|(id, _, _)| *id).collect::<Vec<_>>();
            wait_for_responses(&mut self.socket, &ids).await
        })
        .await
        .map_err(|_| {
            format!(
                "Codex daemon 批量请求在 {} 秒内未全部响应",
                response_timeout.as_secs()
            )
        })?
    }

    async fn close(mut self) {
        let _ = timeout(GRACEFUL_SHUTDOWN_TIMEOUT, self.socket.close(None)).await;
        // 关闭读写句柄让 proxy 正常退出，daemon 仍供其他客户端使用。
        drop(self.socket);
        close_proxy(self.child).await;
    }
}

/// 仅回收本函数直接启动的 proxy 进程树，不按 codex 进程名清理，也不执行 daemon stop。
pub(crate) async fn close_proxy(mut child: Child) {
    let process_id = child.id();
    if timeout(GRACEFUL_SHUTDOWN_TIMEOUT, child.wait())
        .await
        .is_err()
    {
        #[cfg(target_os = "windows")]
        if let Some(process_id) = process_id {
            let mut command = Command::new("taskkill.exe");
            command
                .args(["/PID", &process_id.to_string(), "/T", "/F"])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .creation_flags(CREATE_NO_WINDOW);
            let _ = command.status().await;
        }
        #[cfg(unix)]
        if let Some(process_id) = process_id {
            let _ = Command::new("/bin/kill")
                .arg("-KILL")
                .arg(format!("-{process_id}"))
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .await;
        }
        let _ = child.start_kill();
        let _ = child.wait().await;
    }
}

#[derive(Debug)]
enum RpcError {
    Remote(String),
    Transport(String),
}

impl RpcError {
    fn into_message(self) -> String {
        match self {
            Self::Remote(message) | Self::Transport(message) => message,
        }
    }
}

fn response_result(message: &Value) -> Result<Value, RpcError> {
    if let Some(error) = message.get("error") {
        return Err(RpcError::Remote(
            error
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or("Codex daemon 拒绝了请求")
                .to_owned(),
        ));
    }
    message
        .get("result")
        .cloned()
        .ok_or_else(|| RpcError::Transport("响应缺少 result".to_owned()))
}

async fn next_rpc_message<S>(socket: &mut WebSocketStream<S>) -> Result<Value, String>
where
    S: AsyncRead + AsyncWrite + Unpin,
{
    loop {
        match socket.next().await {
            Some(Ok(Message::Text(text))) => {
                return serde_json::from_str(&text)
                    .map_err(|error| format!("Codex daemon 返回无效 JSON：{error}"))
            }
            Some(Ok(Message::Ping(_) | Message::Pong(_))) => {
                // tungstenite 自动排队 pong；及时 flush，避免对端认为连接失活。
                socket
                    .flush()
                    .await
                    .map_err(|error| format!("Codex daemon 控制帧发送失败：{error}"))?;
            }
            Some(Ok(Message::Close(_))) | None => return Err("Codex daemon 连接已断开".to_owned()),
            Some(Err(error)) => return Err(format!("读取 Codex daemon 响应失败：{error}")),
            Some(Ok(_)) => return Err("Codex daemon 返回非文本消息".to_owned()),
        }
    }
}

async fn wait_for_responses<S>(
    socket: &mut WebSocketStream<S>,
    request_ids: &[u64],
) -> Result<Vec<Result<Value, String>>, String>
where
    S: AsyncRead + AsyncWrite + Unpin,
{
    let indexes = request_ids
        .iter()
        .enumerate()
        .map(|(index, id)| (*id, index))
        .collect::<HashMap<_, _>>();
    let mut responses = vec![None; request_ids.len()];
    let mut remaining = request_ids.len();
    while remaining > 0 {
        let message = next_rpc_message(socket).await?;
        if message.get("method").is_some() {
            continue;
        }
        let Some(index) = message
            .get("id")
            .and_then(Value::as_u64)
            .and_then(|id| indexes.get(&id).copied())
        else {
            continue;
        };
        if responses[index].is_some() {
            continue;
        }
        // 业务错误属于单个请求；协议错误意味着整批传输不再可信。
        responses[index] = Some(match response_result(&message) {
            Ok(value) => Ok(value),
            Err(RpcError::Remote(error)) => Err(error),
            Err(RpcError::Transport(error)) => return Err(error),
        });
        remaining -= 1;
    }
    Ok(responses
        .into_iter()
        .map(|response| response.expect("已收齐全部批量响应"))
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio_tungstenite::tungstenite::protocol::Role;

    #[test]
    fn empty_cli_path_keeps_system_default() {
        assert_eq!(normalize_cli_path("  ").expect("空路径应合法"), None);
    }

    #[test]
    fn quoted_cli_path_is_accepted() {
        let executable = std::env::current_exe().expect("应取得测试进程路径");
        assert_eq!(
            normalize_cli_path(&format!("\"{}\"", executable.display())).unwrap(),
            Some(executable)
        );
    }

    #[test]
    fn cli_requires_version_0157_or_newer() {
        for version in [
            "codex-cli 0.157.0",
            "codex-cli 0.160.0",
            "0.157.0-alpha.1",
            "codex-cli 1.0.0",
        ] {
            assert!(validate_cli_version(version).is_ok(), "{version}");
        }
        for version in ["codex-cli 0.156.9", "codex-cli 0.99.0", "unexpected"] {
            assert!(validate_cli_version(version).is_err(), "{version}");
        }
    }

    #[test]
    fn remote_errors_do_not_invalidate_transport() {
        assert!(matches!(
            response_result(&json!({"error":{"message":"missing thread"}})),
            Err(RpcError::Remote(_))
        ));
        assert!(matches!(
            response_result(&json!({"id":1})),
            Err(RpcError::Transport(_))
        ));
    }

    #[test]
    fn websocket_batch_handles_control_frames_notifications_and_reordered_responses() {
        tauri::async_runtime::block_on(async {
            let (client, server) = tokio::io::duplex(4_096);
            let mut client = WebSocketStream::from_raw_socket(client, Role::Client, None).await;
            let mut server = WebSocketStream::from_raw_socket(server, Role::Server, None).await;
            let writer = tokio::spawn(async move {
                for message in [
                    Message::Ping(vec![1, 2].into()),
                    Message::Text(
                        json!({"method":"thread/updated","params":{}})
                            .to_string()
                            .into(),
                    ),
                    Message::Text(
                        json!({"id":12,"result":{"thread":{"id":"second"}}})
                            .to_string()
                            .into(),
                    ),
                    Message::Text(
                        json!({"id":12,"result":{"ignored":"duplicate"}})
                            .to_string()
                            .into(),
                    ),
                    Message::Text(
                        json!({"id":11,"error":{"message":"first failed"}})
                            .to_string()
                            .into(),
                    ),
                ] {
                    server.send(message).await.unwrap();
                }
                // 保持 socket 存活直到客户端发送 Close，让自动 Pong 可以正常写入。
                while let Some(Ok(message)) = server.next().await {
                    if matches!(message, Message::Close(_)) {
                        break;
                    }
                }
            });
            let responses = timeout(
                Duration::from_secs(1),
                wait_for_responses(&mut client, &[11, 12]),
            )
            .await
            .unwrap()
            .unwrap();
            assert_eq!(responses[0].as_ref().unwrap_err(), "first failed");
            assert_eq!(
                responses[1]
                    .as_ref()
                    .unwrap()
                    .pointer("/thread/id")
                    .and_then(Value::as_str),
                Some("second")
            );
            client.close(None).await.unwrap();
            writer.await.unwrap();
        });
    }

    #[test]
    fn websocket_disconnect_is_reported() {
        tauri::async_runtime::block_on(async {
            let (client, server) = tokio::io::duplex(128);
            let mut socket = WebSocketStream::from_raw_socket(client, Role::Client, None).await;
            drop(server);
            assert!(next_rpc_message(&mut socket).await.is_err());
        });
    }

    /// 显式运行时仅查询账户和会话，不生成模型任务，不停止或重启 daemon。
    #[test]
    #[ignore = "需要本机已登录的 Codex CLI ≥ 0.157.0"]
    fn shared_daemon_read_only_smoke() {
        tauri::async_runtime::block_on(async {
            let state = AppServerState::default();
            state.warm_up().await.expect("应连接共享 daemon");
            let (account, threads, background) = tokio::join!(
                state.request_with_timeout(
                    "account/read",
                    json!({"refreshToken":false}),
                    Duration::from_secs(20)
                ),
                state.request("thread/list", json!({"limit":1})),
                state.request_background_batch(vec![
                    ("thread/list".to_owned(), json!({"limit":1})),
                    ("thread/loaded/list".to_owned(), json!({})),
                ]),
            );
            account.expect("应读取账户");
            let threads = threads.expect("应读取会话");
            for response in background.expect("后台批次应完成") {
                response.expect("后台 RPC 应成功");
            }
            if let Some(thread_id) = threads.pointer("/data/0/id").and_then(Value::as_str) {
                let detail = crate::threads::read_thread(&state, thread_id)
                    .await
                    .expect("应读取真实会话的最近回合");
                let detail = serde_json::to_value(detail).unwrap();
                if let Some(cursor) = detail.get("nextCursor").and_then(Value::as_str) {
                    crate::threads::read_thread_page(&state, thread_id, cursor)
                        .await
                        .expect("应读取更早回合");
                }
            }
            let child_id = state.threads.lock().await.as_ref().unwrap().child.id();
            assert!(state
                .request("desk/unknown-method", json!({}))
                .await
                .is_err());
            assert_eq!(
                state.threads.lock().await.as_ref().unwrap().child.id(),
                child_id,
                "业务错误不应重建连接"
            );
            state.shutdown().await;
            assert!(state.account.lock().await.is_none());
            assert!(state.threads.lock().await.is_none());
            assert!(state.background.lock().await.is_none());
            let output = cli_command(None, &["app-server", "daemon", "version"])
                .output()
                .await
                .unwrap();
            let version: Value = serde_json::from_slice(&output.stdout).unwrap();
            assert_eq!(
                version.get("status").and_then(Value::as_str),
                Some("running"),
                "退出 Desk 连接后共享 daemon 必须继续运行"
            );
            // 断开后下一次读取应重新连接同一共享服务。
            state
                .request("thread/list", json!({"limit":1}))
                .await
                .expect("应能重连");
            state.shutdown().await;
        });
    }

    /// 额度需要 daemon 能访问 ChatGPT；单独验证，避免网络故障掩盖本地生命周期测试。
    #[test]
    #[ignore = "需要本机已登录的 CLI，且 daemon 可访问 ChatGPT"]
    fn shared_daemon_quota_read_only_smoke() {
        tauri::async_runtime::block_on(async {
            let state = AppServerState::default();
            let result = crate::quota::read_quota(&state).await;
            state.shutdown().await;
            result.expect("应读取额度并完成归一化");
        });
    }
}
