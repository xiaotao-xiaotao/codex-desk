use serde_json::{json, Value};
use std::{
    process::Stdio,
    sync::atomic::{AtomicU64, AtomicUsize, Ordering},
};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, ChildStdout, Command},
    sync::Mutex,
    time::{sleep, timeout, Duration},
};

/// 大多数 RPC 保持较短超时，避免会话等非核心读取长期占用单路连接。
const DEFAULT_REQUEST_TIMEOUT: Duration = Duration::from_secs(8);
// 趋势等后台读取检测到交互请求后，短暂让出调度机会，避免循环让出 CPU。
const BACKGROUND_REQUEST_YIELD_DELAY: Duration = Duration::from_millis(25);

// 由桌面端托管的 Codex app-server 不需要独立控制台窗口。
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

type ResponseLines = tokio::io::Lines<BufReader<ChildStdout>>;

/// 与本机 Codex app-server 保持的一条 JSON-RPC 连接。
///
/// 连接层不感知额度、会话等领域概念，调用方只需要提供协议方法和参数。
struct CodexAppServer {
    child: Child,
    stdin: ChildStdin,
    reader: ResponseLines,
}

/// 应用级 App Server 连接状态。
///
/// 标准输入输出使用同一条流；互斥锁确保请求与响应不会交错，避免把其他请求的
/// JSON-RPC 响应错误地交给当前调用方。
pub struct AppServerState {
    server: Mutex<Option<CodexAppServer>>,
    /// 每次请求使用不同 JSON-RPC ID，便于协议日志定位，也为后续并发调度保留空间。
    next_request_id: AtomicU64,
    /// 交互请求排队或执行期间，后台任务不再抢占下一次 App Server 调用。
    interactive_requests: AtomicUsize,
}

impl Default for AppServerState {
    fn default() -> Self {
        Self {
            server: Mutex::new(None),
            // initialize 占用 JSON-RPC ID 1，业务请求从 2 开始。
            next_request_id: AtomicU64::new(2),
            interactive_requests: AtomicUsize::new(0),
        }
    }
}

impl AppServerState {
    /// 启动阶段预热 app-server；失败时保留空状态，下一次请求会自动重试。
    pub async fn warm_up(&self) -> Result<(), String> {
        let mut connection = self.server.lock().await;
        if connection.is_none() {
            *connection = Some(CodexAppServer::connect().await?);
        }
        Ok(())
    }

    /// 向 App Server 发起一次串行 JSON-RPC 调用。
    pub async fn request(&self, method: &str, params: Value) -> Result<Value, String> {
        self.request_with_timeout(method, params, DEFAULT_REQUEST_TIMEOUT)
            .await
    }

    /// 向 App Server 发起一次可指定响应等待时间的串行 JSON-RPC 调用。
    ///
    /// 额度读取是首页的核心信息，服务端偶发慢响应不应按会话读取的短超时处理。
    pub async fn request_with_timeout(
        &self,
        method: &str,
        params: Value,
        response_timeout: Duration,
    ) -> Result<Value, String> {
        let _interactive_request = InteractiveRequestGuard::new(&self.interactive_requests);
        let request_id = self.next_request_id.fetch_add(1, Ordering::Relaxed);
        let mut connection = self.server.lock().await;
        Self::request_locked(
            &mut connection,
            request_id,
            method,
            params,
            response_timeout,
        )
        .await
    }

    /// 执行可延后的后台读取。交互请求到达后，后台任务会在下一条 RPC 前主动让路。
    ///
    /// App Server 的 stdio 连接仍保持单路串行，避免响应交错；这里仅区分“谁先获得
    /// 下一次调用机会”，例如趋势聚合不会连续占满会话详情读取队列。
    pub async fn request_background(&self, method: &str, params: Value) -> Result<Value, String> {
        let request_id = self.next_request_id.fetch_add(1, Ordering::Relaxed);
        loop {
            if self.interactive_requests.load(Ordering::Acquire) != 0 {
                sleep(BACKGROUND_REQUEST_YIELD_DELAY).await;
                continue;
            }

            let mut connection = self.server.lock().await;
            // 在等待锁期间可能已有交互请求入队；检查后再决定是否执行后台 RPC。
            if self.interactive_requests.load(Ordering::Acquire) != 0 {
                drop(connection);
                sleep(BACKGROUND_REQUEST_YIELD_DELAY).await;
                continue;
            }
            return Self::request_locked(
                &mut connection,
                request_id,
                method,
                params,
                DEFAULT_REQUEST_TIMEOUT,
            )
            .await;
        }
    }

    async fn request_locked(
        connection: &mut Option<CodexAppServer>,
        request_id: u64,
        method: &str,
        params: Value,
        response_timeout: Duration,
    ) -> Result<Value, String> {
        if connection.is_none() {
            *connection = Some(CodexAppServer::connect().await?);
        }

        let result = connection
            .as_mut()
            .expect("已建立 app-server 连接")
            .request(request_id, method, params, response_timeout)
            .await;

        if result.is_err() {
            // 超时、进程退出或协议异常后不复用该连接，下一次调用会自动重连。
            if let Some(server) = connection.take() {
                server.close().await;
            }
        }
        result
    }

    /// 应用主动退出时显式结束常驻子进程，避免依赖操作系统回收。
    pub async fn shutdown(&self) {
        let server = self.server.lock().await.take();
        if let Some(server) = server {
            server.close().await;
        }
    }
}

/// 计数在 future 被取消时也必须释放，否则后台任务会永久误判为存在交互请求。
struct InteractiveRequestGuard<'a> {
    counter: &'a AtomicUsize,
}

impl<'a> InteractiveRequestGuard<'a> {
    fn new(counter: &'a AtomicUsize) -> Self {
        counter.fetch_add(1, Ordering::AcqRel);
        Self { counter }
    }
}

impl Drop for InteractiveRequestGuard<'_> {
    fn drop(&mut self) {
        self.counter.fetch_sub(1, Ordering::AcqRel);
    }
}

/// 诊断时独立读取 CLI 版本，便于把“未安装”与“已安装但未登录”区分开。
pub async fn read_cli_version() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("cmd");
        command.args(["/C", "codex.cmd", "--version"]);
        command
    };
    #[cfg(not(target_os = "windows"))]
    let mut command = Command::new("codex");

    #[cfg(not(target_os = "windows"))]
    command.arg("--version");

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

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
    (!version.is_empty())
        .then_some(version)
        .ok_or_else(|| "Codex CLI 未返回版本信息".to_owned())
}

impl CodexAppServer {
    async fn connect() -> Result<Self, String> {
        #[cfg(target_os = "windows")]
        let mut command = {
            let mut command = Command::new("cmd");
            // npm 安装的 CLI 通常为 codex.cmd，必须经 cmd.exe 解析。
            command.args(["/C", "codex.cmd", "app-server", "--stdio"]);
            command
        };
        #[cfg(not(target_os = "windows"))]
        let mut command = {
            let mut command = Command::new("codex");
            command.args(["app-server", "--stdio"]);
            command
        };

        #[cfg(target_os = "windows")]
        command.creation_flags(CREATE_NO_WINDOW);

        let mut child = command
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .spawn()
            .map_err(|error| format!("无法启动 Codex CLI：{error}"))?;
        let stdin = child.stdin.take().ok_or("无法获取 Codex 输入通道")?;
        let stdout = child.stdout.take().ok_or("无法获取 Codex 输出通道")?;
        let mut server = Self {
            child,
            stdin,
            reader: BufReader::new(stdout).lines(),
        };
        server
            .request(
                1,
                "initialize",
                json!({ "clientInfo": { "name": "codex-desk", "version": "1.1.1" } }),
                DEFAULT_REQUEST_TIMEOUT,
            )
            .await?;
        // initialized 是通知，不会返回 JSON-RPC 响应。
        server
            .stdin
            .write_all(b"{\"method\":\"initialized\"}\n")
            .await
            .map_err(|error| format!("发送初始化通知失败：{error}"))?;
        Ok(server)
    }

    async fn request(
        &mut self,
        id: u64,
        method: &str,
        params: Value,
        response_timeout: Duration,
    ) -> Result<Value, String> {
        let payload = json!({ "id": id, "method": method, "params": params });
        self.stdin
            .write_all(format!("{payload}\n").as_bytes())
            .await
            .map_err(|error| format!("发送 {method} 请求失败：{error}"))?;
        wait_for_response(&mut self.reader, id, response_timeout).await
    }

    async fn close(mut self) {
        let _ = self.child.kill().await;
    }
}

async fn wait_for_response(
    reader: &mut ResponseLines,
    request_id: u64,
    response_timeout: Duration,
) -> Result<Value, String> {
    timeout(response_timeout, async {
        while let Some(line) = reader
            .next_line()
            .await
            .map_err(|error| error.to_string())?
        {
            let message: Value = match serde_json::from_str(&line) {
                Ok(message) => message,
                // App Server 通知与响应共享输出流；格式异常的行不能中断整个桌面端。
                Err(_) => continue,
            };
            if message.get("id").and_then(Value::as_u64) != Some(request_id) {
                continue;
            }
            if let Some(error) = message.get("error") {
                return Err(error
                    .get("message")
                    .and_then(Value::as_str)
                    .unwrap_or("Codex app-server 拒绝了请求")
                    .to_owned());
            }
            return message
                .get("result")
                .cloned()
                .ok_or_else(|| "响应缺少 result".to_owned());
        }
        Err("Codex app-server 已结束".to_owned())
    })
    .await
    .map_err(|_| {
        format!(
            "Codex app-server 在 {} 秒内未响应",
            response_timeout.as_secs()
        )
    })?
}
