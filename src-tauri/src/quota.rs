use serde::Serialize;
use serde_json::{json, Value};
use std::process::Stdio;
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, ChildStdout, Command},
    sync::Mutex,
    time::{timeout, Duration},
};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(8);
const RECENT_THREAD_LIMIT: usize = 100;
// 两列会话卡片布局下，每页展示 10 条，兼顾可读性与可见数量。
const THREAD_PAGE_SIZE: usize = 10;
const MAX_MESSAGES: usize = 120;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuotaWindow {
    /// 原始窗口长度由前端按当前界面语言格式化，避免后端固定输出某一种语言。
    duration_minutes: Option<i64>,
    used_percent: f64,
    remaining_percent: f64,
    resets_at: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuotaSnapshot {
    windows: Vec<QuotaWindow>,
    plan_type: Option<String>,
    reset_credits: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ThreadSummary {
    id: String,
    title: String,
    updated_at: Option<Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadSearchResult {
    threads: Vec<ThreadSummary>,
    total: usize,
    page: usize,
    page_size: usize,
    total_pages: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ThreadMessage {
    role: String,
    text: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadDetail {
    id: String,
    title: String,
    updated_at: Option<Value>,
    messages: Vec<ThreadMessage>,
    truncated: bool,
}

type ResponseLines = tokio::io::Lines<BufReader<ChildStdout>>;

/// 与本机 Codex app-server 保持的单条 JSON-RPC 连接。
struct CodexAppServer {
    child: Child,
    stdin: ChildStdin,
    reader: ResponseLines,
}

/// 应用级连接状态。互斥锁让标准输入输出流上的请求严格串行，避免响应交错。
pub struct AppServerState {
    server: Mutex<Option<CodexAppServer>>,
}

impl Default for AppServerState {
    fn default() -> Self {
        Self {
            server: Mutex::new(None),
        }
    }
}

impl AppServerState {
    /// 启动阶段预热 app-server；失败时保留空状态，后续请求会自动重试连接。
    pub async fn warm_up(&self) -> Result<(), String> {
        let mut connection = self.server.lock().await;
        if connection.is_none() {
            *connection = Some(CodexAppServer::connect().await?);
        }
        Ok(())
    }

    async fn request(&self, method: &str, params: Value) -> Result<Value, String> {
        let mut connection = self.server.lock().await;
        if connection.is_none() {
            *connection = Some(CodexAppServer::connect().await?);
        }
        let result = connection
            .as_mut()
            .expect("已建立 app-server 连接")
            .request(2, method, params)
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
                json!({ "clientInfo": { "name": "codex-desk", "version": "0.1.0" } }),
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

    async fn request(&mut self, id: u64, method: &str, params: Value) -> Result<Value, String> {
        let payload = json!({ "id": id, "method": method, "params": params });
        self.stdin
            .write_all(format!("{payload}\n").as_bytes())
            .await
            .map_err(|error| format!("发送 {method} 请求失败：{error}"))?;
        wait_for_response(&mut self.reader, id).await
    }

    async fn close(mut self) {
        let _ = self.child.kill().await;
    }
}

/// 仅从当前本机已登录的 Codex CLI 读取额度；不会读取或保存 auth.json。
pub async fn read_quota(state: &AppServerState) -> Result<QuotaSnapshot, String> {
    normalize_quota(&state.request("account/rateLimits/read", Value::Null).await?)
}

pub async fn search_threads(
    state: &AppServerState,
    query: &str,
    page: u32,
) -> Result<ThreadSearchResult, String> {
    let query = query.trim();
    if query.chars().count() > 120 {
        return Err("搜索关键词不能超过 120 个字符".to_owned());
    }
    let result = state
        .request(
            "thread/list",
            json!({
                "cursor": null,
                "limit": RECENT_THREAD_LIMIT,
                "sortKey": "updated_at",
                "sortDirection": "desc",
                "archived": false,
                "useStateDbOnly": true,
            }),
        )
        .await;
    let threads = filter_threads(normalize_threads(&result?), query);
    Ok(paginate_threads(threads, page as usize))
}

pub async fn read_thread(state: &AppServerState, thread_id: &str) -> Result<ThreadDetail, String> {
    if !is_valid_thread_id(thread_id) {
        return Err("无效的会话标识".to_owned());
    }
    let result = state
        .request("thread/read", json!({ "threadId": thread_id, "includeTurns": true }))
        .await;
    normalize_thread_detail(&result?)
}

async fn wait_for_response(reader: &mut ResponseLines, request_id: u64) -> Result<Value, String> {
    timeout(REQUEST_TIMEOUT, async {
        while let Some(line) = reader.next_line().await.map_err(|error| error.to_string())? {
            let message: Value = match serde_json::from_str(&line) {
                Ok(message) => message,
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
            return message.get("result").cloned().ok_or_else(|| "响应缺少 result".to_owned());
        }
        Err("Codex app-server 已结束".to_owned())
    })
    .await
    .map_err(|_| "Codex app-server 在 8 秒内未响应".to_owned())?
}

fn normalize_quota(result: &Value) -> Result<QuotaSnapshot, String> {
    let limits = result.get("rateLimits").ok_or("Codex 未返回 rateLimits 字段")?;
    let mut windows = Vec::new();
    for key in ["primary", "secondary"] {
        let Some(window) = limits.get(key).filter(|value| !value.is_null()) else { continue; };
        let used_percent = window.get("usedPercent").and_then(Value::as_f64).unwrap_or(0.0).clamp(0.0, 100.0);
        windows.push(QuotaWindow {
            duration_minutes: window.get("windowDurationMins").and_then(Value::as_i64),
            used_percent,
            remaining_percent: 100.0 - used_percent,
            resets_at: window.get("resetsAt").and_then(Value::as_i64),
        });
    }
    if windows.is_empty() { return Err("Codex 未返回可展示的额度窗口".to_owned()); }
    Ok(QuotaSnapshot {
        windows,
        plan_type: limits.get("planType").and_then(Value::as_str).map(str::to_owned),
        reset_credits: result.get("rateLimitResetCredits").and_then(|credits| credits.get("availableCount")).and_then(Value::as_u64).unwrap_or(0),
    })
}

fn normalize_threads(result: &Value) -> Vec<ThreadSummary> {
    let entries = result.get("data").and_then(Value::as_array).or_else(|| result.get("threads").and_then(Value::as_array));
    entries
        .into_iter()
        .flatten()
        .filter_map(|thread| {
            let id = thread.get("id").and_then(Value::as_str)?.to_owned();
            if id.is_empty() { return None; }
            let title = ["name", "title", "preview"].iter().find_map(|key| thread.get(*key).and_then(Value::as_str)).unwrap_or("未命名会话").chars().take(120).collect();
            let updated_at = ["updatedAt", "updated_at", "createdAt"].iter().find_map(|key| thread.get(*key).cloned());
            Some(ThreadSummary { id, title, updated_at })
        })
        .take(RECENT_THREAD_LIMIT)
        .collect()
}

fn filter_threads(threads: Vec<ThreadSummary>, query: &str) -> Vec<ThreadSummary> {
    let keywords: Vec<String> = query.split_whitespace().map(|word| word.to_lowercase()).collect();
    if keywords.is_empty() { return threads; }
    threads
        .into_iter()
        .filter(|thread| {
            let searchable = format!("{}\n{}", thread.title, thread.id).to_lowercase();
            keywords.iter().all(|keyword| fuzzy_matches(&searchable, keyword))
        })
        .collect()
}

fn fuzzy_matches(value: &str, keyword: &str) -> bool {
    if value.contains(keyword) { return true; }
    let mut characters = value.chars();
    keyword.chars().all(|target| characters.by_ref().any(|value| value == target))
}

fn paginate_threads(threads: Vec<ThreadSummary>, requested_page: usize) -> ThreadSearchResult {
    let total = threads.len();
    let total_pages = (total + THREAD_PAGE_SIZE - 1) / THREAD_PAGE_SIZE;
    let page = if total_pages == 0 { 1 } else { requested_page.max(1).min(total_pages) };
    let start = (page - 1) * THREAD_PAGE_SIZE;
    ThreadSearchResult { threads: threads.into_iter().skip(start).take(THREAD_PAGE_SIZE).collect(), total, page, page_size: THREAD_PAGE_SIZE, total_pages }
}

fn normalize_thread_detail(result: &Value) -> Result<ThreadDetail, String> {
    let thread = result.get("thread").ok_or("Codex 未返回可识别的会话详情")?;
    let id = thread.get("id").and_then(Value::as_str).filter(|id| !id.is_empty()).ok_or("Codex 未返回可识别的会话详情")?.to_owned();
    let title = ["name", "title", "preview"].iter().find_map(|key| thread.get(*key).and_then(Value::as_str)).unwrap_or("未命名会话").to_owned();
    let updated_at = ["updatedAt", "updated_at", "createdAt"].iter().find_map(|key| thread.get(*key).cloned());
    let mut messages = Vec::new();
    for turn in thread.get("turns").and_then(Value::as_array).into_iter().flatten() {
        for item in turn.get("items").and_then(Value::as_array).into_iter().flatten() {
            match item.get("type").and_then(Value::as_str) {
                Some("userMessage") => {
                    let text = item.get("content").and_then(Value::as_array).into_iter().flatten()
                        .filter(|part| part.get("type").and_then(Value::as_str) == Some("text"))
                        .filter_map(|part| part.get("text").and_then(Value::as_str))
                        .map(str::trim).filter(|text| !text.is_empty()).collect::<Vec<_>>().join("\n\n");
                    if !text.is_empty() { messages.push(ThreadMessage { role: "user".to_owned(), text }); }
                }
                Some("agentMessage") => {
                    if let Some(text) = item.get("text").and_then(Value::as_str).map(str::trim).filter(|text| !text.is_empty()) {
                        messages.push(ThreadMessage { role: "assistant".to_owned(), text: text.to_owned() });
                    }
                }
                _ => {}
            }
        }
    }
    let truncated = messages.len() > MAX_MESSAGES;
    let messages = if truncated { messages.split_off(messages.len() - MAX_MESSAGES) } else { messages };
    Ok(ThreadDetail { id, title, updated_at, messages, truncated })
}

fn is_valid_thread_id(thread_id: &str) -> bool {
    let length = thread_id.len();
    (8..=128).contains(&length) && thread_id.bytes().all(|character| character.is_ascii_alphanumeric() || character == b'-')
}
