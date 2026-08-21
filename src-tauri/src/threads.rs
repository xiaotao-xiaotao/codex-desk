use crate::app_server::AppServerState;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::path::Path;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::sync::Mutex;

const RECENT_THREAD_LIMIT: usize = 100;
const THREAD_LIST_BATCH_SIZE: usize = 100;
const THREAD_PAGE_SIZE: usize = 10;
const MAX_TRANSFER_THREADS: usize = 5_000;
const MAX_TRANSFER_BUNDLE_BYTES: usize = 64 * 1_024 * 1_024;
const MAX_THREAD_TITLE_LENGTH: usize = 160;
const TRANSFER_FORMAT: &str = "codex-desk-thread-bundle";
const TRANSFER_VERSION: u32 = 1;
// 详情弹窗保留更完整的上下文，同时限制超长会话占用过多内存与渲染空间。
const MAX_MESSAGES: usize = 500;
const MAX_ACTIVITIES: usize = 30;
const TREND_DAY_LIMIT: usize = 7;
const TREND_CACHE_TTL: Duration = Duration::from_secs(60);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadSummary {
    id: String,
    title: String,
    /// 会话首次创建时间；用于和最后更新时间并列展示，避免旧会话被误判为新建。
    created_at: Option<Value>,
    updated_at: Option<Value>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadSearchResult {
    threads: Vec<ThreadSummary>,
    total: usize,
    limit: usize,
    page: usize,
    page_size: usize,
    total_pages: usize,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ThreadMessage {
    role: String,
    text: String,
}

/// 由 Codex Desk 导出的可移植会话包。该格式只携带可见对话文本与时间元数据，
/// 不包含认证信息、插件配置或本机文件路径，避免跨设备复制敏感运行时状态。
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ThreadTransferBundle {
    format: String,
    version: u32,
    exported_at: u64,
    threads: Vec<ThreadTransfer>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ThreadTransfer {
    source_thread_id: String,
    title: String,
    created_at: Option<Value>,
    updated_at: Option<Value>,
    messages: Vec<ThreadMessage>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadTransferFailure {
    title: String,
    error: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadExportResult {
    bundle: String,
    exported: usize,
    failures: Vec<ThreadTransferFailure>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadExportSummary {
    exported: usize,
    failures: Vec<ThreadTransferFailure>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadImportResult {
    total: usize,
    pub imported: usize,
    failures: Vec<ThreadTransferFailure>,
}

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct ThreadInsights {
    turns: usize,
    messages: usize,
    tool_calls: usize,
    file_changes: usize,
    issues: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ThreadActivity {
    kind: String,
    title: String,
    detail: Option<String>,
    status: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadTrendPoint {
    day: String,
    messages: usize,
    tool_calls: usize,
    file_changes: usize,
    issues: usize,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadTrendResponse {
    days: usize,
    points: Vec<ThreadTrendPoint>,
}

struct CachedThreadTrend {
    generated_at: Instant,
    response: ThreadTrendResponse,
}

/// 趋势数据的短期缓存与 App Server 连接状态分离，避免领域缓存污染传输层。
pub struct ThreadTrendState {
    cached: Mutex<Option<CachedThreadTrend>>,
}

impl Default for ThreadTrendState {
    fn default() -> Self {
        Self {
            cached: Mutex::new(None),
        }
    }
}

impl ThreadTrendState {
    /// 会话被批量导入后，旧趋势缓存已不再代表当前本机线程列表。
    pub async fn invalidate(&self) {
        *self.cached.lock().await = None;
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadDetail {
    id: String,
    title: String,
    updated_at: Option<Value>,
    messages: Vec<ThreadMessage>,
    truncated: bool,
    insights: ThreadInsights,
    activities: Vec<ThreadActivity>,
}

/// 读取最近的已持久化线程，在应用侧完成轻量搜索与分页。
pub async fn search_threads(
    state: &AppServerState,
    query: &str,
    page: u32,
) -> Result<ThreadSearchResult, String> {
    let query = query.trim();
    if query.chars().count() > 120 {
        return Err("搜索关键词不能超过 120 个字符".to_owned());
    }
    let threads = list_all_threads(state).await?;
    let threads = filter_threads(threads, query);
    Ok(paginate_threads(threads, page as usize))
}

/// 返回当前筛选条件下的全部会话，供“全选筛选结果”直接取得稳定的会话标识。
/// 页面展示只渲染当前页，批量选择状态则由前端按此列表跨页保存。
pub async fn list_threads_for_selection(
    state: &AppServerState,
    query: &str,
) -> Result<Vec<ThreadSummary>, String> {
    let query = query.trim();
    if query.chars().count() > 120 {
        return Err("搜索关键词不能超过 120 个字符".to_owned());
    }
    Ok(filter_threads(list_all_threads(state).await?, query))
}

/// 将选中的本机会话导出为 Desk 自有 JSON 包。单条会话读取失败不会中止其他会话，
/// 以便批量导出后可针对失败项单独重试。
pub async fn export_threads(
    state: &AppServerState,
    thread_ids: &[String],
) -> Result<ThreadExportResult, String> {
    let thread_ids = normalize_transfer_thread_ids(thread_ids)?;
    let mut threads = Vec::with_capacity(thread_ids.len());
    let mut failures = Vec::new();

    for thread_id in thread_ids {
        match read_transfer_thread(state, &thread_id).await {
            Ok(thread) => threads.push(thread),
            Err(error) => failures.push(ThreadTransferFailure {
                title: thread_id,
                error,
            }),
        }
    }

    if threads.is_empty() {
        return Err("没有可导出的会话，请检查所选会话是否仍存在".to_owned());
    }

    let exported = threads.len();
    let bundle = serde_json::to_string_pretty(&ThreadTransferBundle {
        format: TRANSFER_FORMAT.to_owned(),
        version: TRANSFER_VERSION,
        exported_at: unix_timestamp_seconds(),
        threads,
    })
    .map_err(|error| format!("无法生成导出文件：{error}"))?;

    Ok(ThreadExportResult {
        bundle,
        exported,
        failures,
    })
}

/// 导出包仅写入由原生“另存为”窗口返回的路径，避免前端下载 API 绕过用户对保存位置的选择。
pub async fn export_threads_to_path(
    state: &AppServerState,
    thread_ids: &[String],
    output_path: &Path,
) -> Result<ThreadExportSummary, String> {
    let result = export_threads(state, thread_ids).await?;
    tokio::fs::write(output_path, result.bundle.as_bytes())
        .await
        .map_err(|error| format!("无法写入导出文件：{error}"))?;

    Ok(ThreadExportSummary {
        exported: result.exported,
        failures: result.failures,
    })
}

/// 将 Desk 会话包逐条写入本机 Codex 的线程历史。导入后的线程拥有新的本机 ID，
/// 但会通过本地化标题前缀标明来源，从而可在 `codex resume` 中直接识别。
pub async fn import_threads(
    state: &AppServerState,
    bundle_json: &str,
    imported_title_prefix: &str,
    imported_history_intro: &str,
) -> Result<ThreadImportResult, String> {
    if bundle_json.len() > MAX_TRANSFER_BUNDLE_BYTES {
        return Err("导入文件过大，最大支持 64 MB".to_owned());
    }
    let bundle: ThreadTransferBundle = serde_json::from_str(bundle_json)
        .map_err(|error| format!("无法识别 Codex Desk 导出文件：{error}"))?;
    if bundle.format != TRANSFER_FORMAT || bundle.version != TRANSFER_VERSION {
        return Err("该文件不是受支持的 Codex Desk 会话导出包".to_owned());
    }
    if bundle.threads.is_empty() {
        return Err("导入文件中没有会话".to_owned());
    }
    if bundle.threads.len() > MAX_TRANSFER_THREADS {
        return Err(format!("单次最多导入 {MAX_TRANSFER_THREADS} 个会话"));
    }

    let mut imported = 0;
    let mut failures = Vec::new();
    for transfer in bundle.threads {
        let fallback_title = transfer.title.clone();
        match import_transfer_thread(
            state,
            transfer,
            imported_title_prefix,
            imported_history_intro,
        )
        .await
        {
            Ok(()) => imported += 1,
            Err(error) => failures.push(ThreadTransferFailure {
                title: fallback_title,
                error,
            }),
        }
    }

    // 导入线程会被当前 app-server 加载并持有写入权。批量导入结束后关闭这条连接，
    // 让 CLI 可以立即恢复新会话；前端随后的会话刷新会按需建立下一条连接。
    // AppServerState 由 Mutex 管理，因此整个程序任一时刻最多存在一条 app-server 连接。
    state.shutdown().await;

    Ok(ThreadImportResult {
        total: imported + failures.len(),
        imported,
        failures,
    })
}

/// 聚合最近七个自然日的会话活动。每条数据按回合时间归属到对应日期，
/// 回合缺少时间时才回退到会话更新时间。
pub async fn read_thread_trends(
    state: &AppServerState,
    trend_state: &ThreadTrendState,
    force_refresh: bool,
) -> Result<ThreadTrendResponse, String> {
    if !force_refresh {
        let cached = trend_state.cached.lock().await;
        if let Some(cached) = cached.as_ref() {
            if cached.generated_at.elapsed() < TREND_CACHE_TTL {
                return Ok(cached.response.clone());
            }
        }
    }

    let response = build_thread_trends(state).await?;
    *trend_state.cached.lock().await = Some(CachedThreadTrend {
        generated_at: Instant::now(),
        response: response.clone(),
    });
    Ok(response)
}

async fn list_recent_threads(state: &AppServerState) -> Result<Vec<ThreadSummary>, String> {
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
        .await?;
    Ok(normalize_threads(&result))
}

/// 搜索和“全选筛选结果”使用完整分页列表，而趋势图仍只读取最近会话，
/// 防止历史过多时把趋势聚合放大为不必要的全量详情读取。
async fn list_all_threads(state: &AppServerState) -> Result<Vec<ThreadSummary>, String> {
    let mut cursor = None;
    let mut threads = Vec::new();

    loop {
        let result = state
            .request(
                "thread/list",
                json!({
                    "cursor": cursor,
                    "limit": THREAD_LIST_BATCH_SIZE,
                    "sortKey": "updated_at",
                    "sortDirection": "desc",
                    "archived": false,
                    "useStateDbOnly": true,
                }),
            )
            .await?;
        let page = normalize_threads(&result);
        let page_is_empty = page.is_empty();
        threads.extend(page);
        cursor = next_thread_cursor(&result);
        if page_is_empty || cursor.is_none() {
            break;
        }
    }

    Ok(threads)
}

fn next_thread_cursor(result: &Value) -> Option<Value> {
    ["nextCursor", "next_cursor"]
        .iter()
        .find_map(|key| result.get(*key).cloned())
        .filter(|cursor| !cursor.is_null())
        .filter(|cursor| cursor.as_str().is_none_or(|value| !value.is_empty()))
}

/// 读取一个会话的消息、结构化操作和汇总指标；不解析本地 JSONL 文件。
pub async fn read_thread(state: &AppServerState, thread_id: &str) -> Result<ThreadDetail, String> {
    if !is_valid_thread_id(thread_id) {
        return Err("无效的会话标识".to_owned());
    }
    let result = state
        .request(
            "thread/read",
            json!({ "threadId": thread_id, "includeTurns": true }),
        )
        .await?;
    normalize_thread_detail(&result)
}

async fn read_transfer_thread(
    state: &AppServerState,
    thread_id: &str,
) -> Result<ThreadTransfer, String> {
    let result = state
        .request(
            "thread/read",
            json!({ "threadId": thread_id, "includeTurns": true }),
        )
        .await?;
    let thread = result.get("thread").ok_or("Codex 未返回可导出的会话详情")?;
    let source_thread_id = thread
        .get("id")
        .and_then(Value::as_str)
        .filter(|id| !id.is_empty())
        .ok_or("Codex 未返回可导出的会话标识")?
        .to_owned();
    let created_at = ["createdAt", "created_at"]
        .iter()
        .find_map(|key| thread.get(*key).cloned());
    let updated_at = ["updatedAt", "updated_at", "createdAt", "created_at"]
        .iter()
        .find_map(|key| thread.get(*key).cloned());

    Ok(ThreadTransfer {
        source_thread_id,
        title: thread_title(thread),
        created_at,
        updated_at,
        messages: transfer_messages_from_thread(thread),
    })
}

async fn import_transfer_thread(
    state: &AppServerState,
    transfer: ThreadTransfer,
    imported_title_prefix: &str,
    imported_history_intro: &str,
) -> Result<(), String> {
    validate_transfer_thread(&transfer)?;
    let created = state.request("thread/start", json!({})).await?;
    let thread_id = created
        .get("thread")
        .and_then(|thread| thread.get("id"))
        .and_then(Value::as_str)
        .filter(|id| !id.is_empty())
        .ok_or("Codex 未返回新建会话标识")?
        .to_owned();

    let import_result = async {
        state
            .request(
                "thread/name/set",
                json!({
                    "threadId": thread_id,
                    "name": imported_thread_name(imported_title_prefix, &transfer.title),
                }),
            )
            .await?;
        // App Server 的 inject_items 仅保证模型可见，不能作为 CLI 可浏览的持久化回合。
        // 因此将完整历史作为只读用户回合写入；CLI 可直接查看这条原文，并在下一轮
        // 对话中沿用上下文。导入回合限制为只读且禁止网络，避免批量导入触发实际修改。
        state
            .request(
                "turn/start",
                json!({
                    "threadId": thread_id,
                    "input": [{
                        "type": "text",
                        "text": imported_history_text(imported_history_intro, &transfer),
                    }],
                    "approvalPolicy": "untrusted",
                    "sandboxPolicy": { "type": "readOnly", "networkAccess": false },
                }),
            )
            .await?;
        Ok::<(), String>(())
    }
    .await;

    if let Err(error) = import_result {
        // 只回滚本次刚创建、尚未交付给用户的新会话，避免半成品出现在 CLI 会话列表。
        let _ = state
            .request("thread/delete", json!({ "threadId": thread_id }))
            .await;
        return Err(error);
    }
    Ok(())
}

fn validate_transfer_thread(transfer: &ThreadTransfer) -> Result<(), String> {
    if transfer.source_thread_id.trim().is_empty() {
        return Err("导入会话缺少来源标识".to_owned());
    }
    if transfer.title.trim().is_empty() {
        return Err("导入会话缺少标题".to_owned());
    }
    if transfer.messages.iter().any(|message| {
        !matches!(message.role.as_str(), "user" | "assistant") || message.text.trim().is_empty()
    }) {
        return Err("导入会话包含不受支持的消息格式".to_owned());
    }
    Ok(())
}

fn imported_history_text(intro: &str, transfer: &ThreadTransfer) -> String {
    let mut history = format!("{}\n\n# {}\n", intro.trim(), transfer.title.trim());
    for message in &transfer.messages {
        let role = if message.role == "user" {
            "User"
        } else {
            "Codex"
        };
        history.push_str(&format!("\n## {role}\n{}\n", message.text.trim()));
    }
    history
}

fn imported_thread_name(prefix: &str, title: &str) -> String {
    format!("{prefix}{}", title.trim())
        .chars()
        .take(MAX_THREAD_TITLE_LENGTH)
        .collect()
}

fn normalize_transfer_thread_ids(thread_ids: &[String]) -> Result<Vec<String>, String> {
    if thread_ids.is_empty() {
        return Err("请至少选择一个会话".to_owned());
    }
    if thread_ids.len() > MAX_TRANSFER_THREADS {
        return Err(format!("单次最多导出 {MAX_TRANSFER_THREADS} 个会话"));
    }
    let mut seen = HashSet::new();
    let ids = thread_ids
        .iter()
        .filter(|id| is_valid_thread_id(id))
        .filter(|id| seen.insert((*id).clone()))
        .cloned()
        .collect::<Vec<_>>();
    if ids.is_empty() {
        return Err("没有有效的会话标识".to_owned());
    }
    Ok(ids)
}

fn transfer_messages_from_thread(thread: &Value) -> Vec<ThreadMessage> {
    thread
        .get("turns")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .flat_map(|turn| {
            turn.get("items")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
        })
        .filter_map(thread_message_from_item)
        .collect()
}

fn thread_title(thread: &Value) -> String {
    ["name", "title", "preview"]
        .iter()
        .find_map(|key| thread.get(*key).and_then(Value::as_str))
        .unwrap_or("未命名会话")
        .chars()
        .take(MAX_THREAD_TITLE_LENGTH)
        .collect()
}

fn normalize_threads(result: &Value) -> Vec<ThreadSummary> {
    let entries = result
        .get("data")
        .and_then(Value::as_array)
        .or_else(|| result.get("threads").and_then(Value::as_array));
    entries
        .into_iter()
        .flatten()
        .filter_map(|thread| {
            let id = thread.get("id").and_then(Value::as_str)?.to_owned();
            if id.is_empty() {
                return None;
            }
            let title = ["name", "title", "preview"]
                .iter()
                .find_map(|key| thread.get(*key).and_then(Value::as_str))
                .unwrap_or("未命名会话")
                .chars()
                .take(120)
                .collect();
            let created_at = ["createdAt", "created_at"]
                .iter()
                .find_map(|key| thread.get(*key).cloned());
            let updated_at = ["updatedAt", "updated_at", "createdAt", "created_at"]
                .iter()
                .find_map(|key| thread.get(*key).cloned());
            Some(ThreadSummary {
                id,
                title,
                created_at,
                updated_at,
            })
        })
        .collect()
}

fn normalize_thread_detail(result: &Value) -> Result<ThreadDetail, String> {
    let thread = result.get("thread").ok_or("Codex 未返回可识别的会话详情")?;
    let id = thread
        .get("id")
        .and_then(Value::as_str)
        .filter(|id| !id.is_empty())
        .ok_or("Codex 未返回可识别的会话详情")?
        .to_owned();
    let title = ["name", "title", "preview"]
        .iter()
        .find_map(|key| thread.get(*key).and_then(Value::as_str))
        .unwrap_or("未命名会话")
        .to_owned();
    let updated_at = ["updatedAt", "updated_at", "createdAt"]
        .iter()
        .find_map(|key| thread.get(*key).cloned());

    let mut messages = Vec::new();
    let mut activities = Vec::new();
    let mut insights = ThreadInsights::default();

    for turn in thread
        .get("turns")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        insights.merge(&summarize_turn(turn));
        if let Some(activity) = turn_status_activity(turn) {
            activities.push(activity);
        }
        for item in turn
            .get("items")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            if let Some(message) = thread_message_from_item(item) {
                messages.push(message);
                continue;
            }
            match item.get("type").and_then(Value::as_str) {
                Some("fileChange") => {
                    let count = file_change_count(item);
                    activities.push(file_change_activity(item, count));
                }
                Some(kind) if is_tool_item(kind) => {
                    activities.push(tool_activity(item, kind));
                }
                _ => {}
            }
        }
    }

    let truncated = messages.len() > MAX_MESSAGES;
    let messages = if truncated {
        messages.split_off(messages.len() - MAX_MESSAGES)
    } else {
        messages
    };
    let activities = activities
        .into_iter()
        .rev()
        .take(MAX_ACTIVITIES)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();

    Ok(ThreadDetail {
        id,
        title,
        updated_at,
        messages,
        truncated,
        insights,
        activities,
    })
}

impl ThreadInsights {
    fn merge(&mut self, other: &Self) {
        self.turns += other.turns;
        self.messages += other.messages;
        self.tool_calls += other.tool_calls;
        self.file_changes += other.file_changes;
        self.issues += other.issues;
    }
}

fn summarize_turn(turn: &Value) -> ThreadInsights {
    let mut insights = ThreadInsights {
        turns: 1,
        ..ThreadInsights::default()
    };
    if is_failed_status(turn.get("status").and_then(Value::as_str)) {
        insights.issues += 1;
    }

    for item in turn
        .get("items")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        match item.get("type").and_then(Value::as_str) {
            Some("userMessage") if !extract_user_message(item).is_empty() => insights.messages += 1,
            Some("agentMessage")
                if item
                    .get("text")
                    .and_then(Value::as_str)
                    .is_some_and(|text| !text.trim().is_empty()) =>
            {
                insights.messages += 1
            }
            Some("fileChange") => insights.file_changes += file_change_count(item),
            Some(kind) if is_tool_item(kind) => {
                insights.tool_calls += 1;
                if is_failed_status(item.get("status").and_then(Value::as_str)) {
                    insights.issues += 1;
                }
            }
            _ => {}
        }
    }
    insights
}

fn file_change_count(item: &Value) -> usize {
    item.get("changes")
        .and_then(Value::as_array)
        .map_or(1, Vec::len)
        .max(1)
}

async fn build_thread_trends(state: &AppServerState) -> Result<ThreadTrendResponse, String> {
    let mut points = recent_day_points(TREND_DAY_LIMIT);
    let threads = list_recent_threads(state).await?;

    for summary in threads {
        let fallback_day = summary.updated_at.as_ref().and_then(day_key_from_value);
        if fallback_day
            .as_ref()
            .is_none_or(|day| !points.iter().any(|point| &point.day == day))
        {
            continue;
        }

        let result = match state
            .request(
                "thread/read",
                json!({ "threadId": summary.id, "includeTurns": true }),
            )
            .await
        {
            Ok(result) => result,
            // 单条历史线程不可读不应让整个趋势图空白；下一次刷新会再次尝试。
            Err(_) => continue,
        };
        let Some(thread) = result.get("thread") else {
            continue;
        };

        // 首项与详情弹窗复用同一条消息识别规则，并且每个会话只纳入最新 500 条消息。
        // 消息本身没有独立时间戳，因此以所属回合的时间进行按天归档。
        for day in recent_message_days(thread, fallback_day.as_deref()) {
            if let Some(point) = points.iter_mut().find(|point| point.day == day) {
                point.messages += 1;
            }
        }
        for turn in thread
            .get("turns")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            let day = turn_day_key(turn).or_else(|| fallback_day.clone());
            let Some(day) = day else { continue };
            let Some(point) = points.iter_mut().find(|point| point.day == day) else {
                continue;
            };
            let insights = summarize_turn(turn);
            point.tool_calls += insights.tool_calls;
            point.file_changes += insights.file_changes;
            point.issues += insights.issues;
        }
    }

    Ok(ThreadTrendResponse {
        days: TREND_DAY_LIMIT,
        points,
    })
}

fn turn_day_key(turn: &Value) -> Option<String> {
    [
        "updatedAt",
        "updated_at",
        "completedAt",
        "createdAt",
        "startedAt",
    ]
    .iter()
    .find_map(|key| turn.get(*key).and_then(day_key_from_value))
}

fn recent_day_points(days: usize) -> Vec<ThreadTrendPoint> {
    let today = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_secs() as i64)
        .div_euclid(86_400);
    ((today - days as i64 + 1)..=today)
        .map(|day| ThreadTrendPoint {
            day: day_key_from_unix_day(day),
            messages: 0,
            tool_calls: 0,
            file_changes: 0,
            issues: 0,
        })
        .collect()
}

fn day_key_from_value(value: &Value) -> Option<String> {
    if let Some(text) = value.as_str() {
        let bytes = text.as_bytes();
        if bytes.len() >= 10
            && bytes[4] == b'-'
            && bytes[7] == b'-'
            && bytes[..10]
                .iter()
                .enumerate()
                .all(|(index, byte)| matches!(index, 4 | 7) || byte.is_ascii_digit())
        {
            return Some(text[..10].to_owned());
        }
        if let Ok(timestamp) = text.parse::<f64>() {
            return day_key_from_timestamp(timestamp);
        }
    }
    value.as_f64().and_then(day_key_from_timestamp)
}

fn day_key_from_timestamp(timestamp: f64) -> Option<String> {
    if !timestamp.is_finite() || timestamp <= 0.0 {
        return None;
    }
    let seconds = if timestamp >= 1_000_000_000_000.0 {
        timestamp / 1_000.0
    } else {
        timestamp
    } as i64;
    Some(day_key_from_unix_day(seconds.div_euclid(86_400)))
}

fn unix_timestamp_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_secs())
}

/// 将 Unix 日序号转换为 ISO 日期，避免为了看板引入额外日期库。
fn day_key_from_unix_day(unix_day: i64) -> String {
    let days = unix_day + 719_468;
    let era = if days >= 0 { days } else { days - 146_096 } / 146_097;
    let day_of_era = days - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let mut year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };
    year += i64::from(month <= 2);
    format!("{year:04}-{month:02}-{day:02}")
}

fn extract_user_message(item: &Value) -> String {
    item.get("content")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|part| part.get("type").and_then(Value::as_str) == Some("text"))
        .filter_map(|part| part.get("text").and_then(Value::as_str))
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n")
}

/// 将 App Server 中可直接展示的用户输入和 Codex 回复统一识别，供详情与趋势复用。
fn thread_message_from_item(item: &Value) -> Option<ThreadMessage> {
    match item.get("type").and_then(Value::as_str) {
        Some("userMessage") => {
            let text = extract_user_message(item);
            (!text.is_empty()).then_some(ThreadMessage {
                role: "user".to_owned(),
                text,
            })
        }
        Some("agentMessage") => item
            .get("text")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .map(|text| ThreadMessage {
                role: "assistant".to_owned(),
                text: text.to_owned(),
            }),
        _ => None,
    }
}

/// 详情消息没有独立时间戳，按所属回合的时间标记，并保留与详情一致的最新消息窗口。
fn recent_message_days(thread: &Value, fallback_day: Option<&str>) -> Vec<String> {
    let mut message_days = Vec::new();
    for turn in thread
        .get("turns")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let day = turn_day_key(turn).or_else(|| fallback_day.map(str::to_owned));
        for item in turn
            .get("items")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            if thread_message_from_item(item).is_some() {
                message_days.push(day.clone());
            }
        }
    }
    let start = message_days.len().saturating_sub(MAX_MESSAGES);
    message_days.into_iter().skip(start).flatten().collect()
}

fn turn_status_activity(turn: &Value) -> Option<ThreadActivity> {
    let status = turn.get("status").and_then(Value::as_str)?;
    if !is_failed_status(Some(status)) {
        return None;
    }
    let detail = turn
        .get("error")
        .and_then(|error| error.get("message"))
        .and_then(Value::as_str)
        .map(str::to_owned);
    Some(ThreadActivity {
        kind: "issue".to_owned(),
        title: "回合未正常完成".to_owned(),
        detail,
        status: Some(status.to_owned()),
    })
}

fn file_change_activity(item: &Value, count: usize) -> ThreadActivity {
    let paths = item
        .get("changes")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|change| change.get("path").and_then(Value::as_str))
        .take(3)
        .collect::<Vec<_>>();
    let detail = if paths.is_empty() {
        None
    } else {
        Some(paths.join(" · "))
    };
    ThreadActivity {
        kind: "file".to_owned(),
        title: format!("变更 {count} 个文件"),
        detail,
        status: item
            .get("status")
            .and_then(Value::as_str)
            .map(str::to_owned),
    }
}

fn tool_activity(item: &Value, kind: &str) -> ThreadActivity {
    let title = match kind {
        "commandExecution" => item
            .get("command")
            .and_then(Value::as_str)
            .map(compact_text)
            .unwrap_or_else(|| "执行命令".to_owned()),
        "mcpToolCall" => join_non_empty(
            item.get("server").and_then(Value::as_str),
            item.get("tool").and_then(Value::as_str),
        )
        .unwrap_or_else(|| "MCP 工具调用".to_owned()),
        "dynamicToolCall" | "collabToolCall" => item
            .get("tool")
            .and_then(Value::as_str)
            .map(str::to_owned)
            .unwrap_or_else(|| "工具调用".to_owned()),
        "webSearch" => item
            .get("query")
            .and_then(Value::as_str)
            .map(compact_text)
            .unwrap_or_else(|| "网页搜索".to_owned()),
        "imageView" => item
            .get("path")
            .and_then(Value::as_str)
            .map(compact_text)
            .unwrap_or_else(|| "查看图片".to_owned()),
        _ => "工具调用".to_owned(),
    };
    let detail = match kind {
        "commandExecution" => item.get("cwd").and_then(Value::as_str).map(compact_text),
        "mcpToolCall" => item.get("error").and_then(Value::as_str).map(compact_text),
        _ => None,
    };
    ThreadActivity {
        kind: "tool".to_owned(),
        title,
        detail,
        status: item
            .get("status")
            .and_then(Value::as_str)
            .map(str::to_owned),
    }
}

fn compact_text(value: &str) -> String {
    let compact = value.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut chars = compact.chars();
    let preview = chars.by_ref().take(120).collect::<String>();
    if chars.next().is_some() {
        format!("{preview}…")
    } else {
        preview
    }
}

fn join_non_empty(first: Option<&str>, second: Option<&str>) -> Option<String> {
    match (
        first.filter(|value| !value.is_empty()),
        second.filter(|value| !value.is_empty()),
    ) {
        (Some(first), Some(second)) => Some(format!("{first} · {second}")),
        (Some(value), None) | (None, Some(value)) => Some(value.to_owned()),
        (None, None) => None,
    }
}

fn is_tool_item(kind: &str) -> bool {
    matches!(
        kind,
        "commandExecution"
            | "mcpToolCall"
            | "dynamicToolCall"
            | "collabToolCall"
            | "webSearch"
            | "imageView"
    )
}

fn is_failed_status(status: Option<&str>) -> bool {
    matches!(status, Some("failed") | Some("interrupted"))
}

fn filter_threads(threads: Vec<ThreadSummary>, query: &str) -> Vec<ThreadSummary> {
    let keywords: Vec<String> = query
        .split_whitespace()
        .map(|word| word.to_lowercase())
        .collect();
    if keywords.is_empty() {
        return threads;
    }
    threads
        .into_iter()
        .filter(|thread| {
            let searchable = format!("{}\n{}", thread.title, thread.id).to_lowercase();
            keywords
                .iter()
                .all(|keyword| fuzzy_matches(&searchable, keyword))
        })
        .collect()
}

fn fuzzy_matches(value: &str, keyword: &str) -> bool {
    if value.contains(keyword) {
        return true;
    }
    let mut characters = value.chars();
    keyword
        .chars()
        .all(|target| characters.by_ref().any(|value| value == target))
}

fn paginate_threads(threads: Vec<ThreadSummary>, requested_page: usize) -> ThreadSearchResult {
    let total = threads.len();
    let total_pages = total.div_ceil(THREAD_PAGE_SIZE);
    let page = if total_pages == 0 {
        1
    } else {
        requested_page.max(1).min(total_pages)
    };
    let start = (page - 1) * THREAD_PAGE_SIZE;
    ThreadSearchResult {
        threads: threads
            .into_iter()
            .skip(start)
            .take(THREAD_PAGE_SIZE)
            .collect(),
        total,
        limit: RECENT_THREAD_LIMIT,
        page,
        page_size: THREAD_PAGE_SIZE,
        total_pages,
    }
}

fn is_valid_thread_id(thread_id: &str) -> bool {
    let length = thread_id.len();
    (8..=128).contains(&length)
        && thread_id
            .bytes()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, b'-' | b'_'))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_messages_and_structured_activities() {
        let result = json!({
            "thread": {
                "id": "thread-12345678",
                "name": "测试会话",
                "turns": [
                    {
                        "status": "completed",
                        "items": [
                            { "type": "userMessage", "content": [{ "type": "text", "text": "修复仪表盘" }] },
                            { "type": "commandExecution", "command": "npm run build", "cwd": "D:/work", "status": "completed" },
                            { "type": "fileChange", "status": "completed", "changes": [{ "path": "src/main.js" }, { "path": "src/styles.css" }] },
                            { "type": "agentMessage", "text": "已完成。" }
                        ]
                    },
                    {
                        "status": "interrupted",
                        "error": { "message": "用户停止了任务" },
                        "items": [
                            { "type": "dynamicToolCall", "tool": "preview", "status": "failed" }
                        ]
                    }
                ]
            }
        });

        let detail = normalize_thread_detail(&result).expect("会话详情应可归一化");

        assert_eq!(detail.insights.turns, 2);
        assert_eq!(detail.insights.messages, 2);
        assert_eq!(detail.insights.tool_calls, 2);
        assert_eq!(detail.insights.file_changes, 2);
        assert_eq!(detail.insights.issues, 2);
        assert_eq!(detail.messages.len(), 2);
        assert!(detail
            .activities
            .iter()
            .any(|activity| activity.kind == "file"));
        assert!(detail
            .activities
            .iter()
            .any(|activity| activity.kind == "issue"));
    }

    #[test]
    fn fuzzy_search_keeps_subsequence_matches() {
        assert!(fuzzy_matches("修复仪表盘布局", "修盘"));
        assert!(!fuzzy_matches("修复仪表盘布局", "测试"));
    }

    #[test]
    fn accepts_app_server_thread_identifier_shapes() {
        assert!(is_valid_thread_id("thr_12345678"));
        assert!(is_valid_thread_id("019c1f22-8ef6-7140-9bd9-7cfbde19c904"));
        assert!(!is_valid_thread_id("short"));
    }

    #[test]
    fn normalizes_iso_and_epoch_timestamps_to_trend_days() {
        assert_eq!(
            day_key_from_value(&json!("2026-08-21T10:30:00+08:00")),
            Some("2026-08-21".to_owned())
        );
        assert_eq!(
            day_key_from_value(&json!(1_704_067_200)),
            Some("2024-01-01".to_owned())
        );
        assert_eq!(
            day_key_from_value(&json!(1_704_067_200_000_i64)),
            Some("2024-01-01".to_owned())
        );
    }

    #[test]
    fn keeps_created_and_updated_times_distinct_for_thread_cards() {
        let threads = normalize_threads(&json!({
            "data": [{
                "id": "thread-12345678",
                "title": "昨天创建、今天继续的会话",
                "createdAt": 1_787_213_528_i64,
                "updatedAt": 1_787_275_415_i64
            }]
        }));

        assert_eq!(threads.len(), 1);
        assert_eq!(threads[0].created_at, Some(json!(1_787_213_528_i64)));
        assert_eq!(threads[0].updated_at, Some(json!(1_787_275_415_i64)));
    }

    #[test]
    fn transfer_only_keeps_displayable_user_and_codex_messages() {
        let messages = transfer_messages_from_thread(&json!({
            "turns": [{
                "items": [
                    { "type": "userMessage", "content": [{ "type": "text", "text": "导出这段对话" }] },
                    { "type": "commandExecution", "command": "git status" },
                    { "type": "agentMessage", "text": "已准备导出。" }
                ]
            }]
        }));

        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].role, "user");
        assert_eq!(messages[1].role, "assistant");
    }

    #[test]
    fn imported_history_keeps_title_and_message_order() {
        let transfer = ThreadTransfer {
            source_thread_id: "thr_source_12345678".to_owned(),
            title: "登录问题排查".to_owned(),
            created_at: None,
            updated_at: None,
            messages: vec![
                ThreadMessage {
                    role: "user".to_owned(),
                    text: "登录失败".to_owned(),
                },
                ThreadMessage {
                    role: "assistant".to_owned(),
                    text: "请检查令牌。".to_owned(),
                },
            ],
        };

        let history = imported_history_text("导入记录", &transfer);
        assert!(history.starts_with("导入记录\n\n# 登录问题排查"));
        assert!(history.find("## User").unwrap() < history.find("## Codex").unwrap());
        assert!(history.contains("登录失败"));
        assert!(history.contains("请检查令牌。"));
    }

    #[test]
    fn imported_name_uses_localized_prefix() {
        assert_eq!(
            imported_thread_name("[Imported by Codex Desk] ", "Session title"),
            "[Imported by Codex Desk] Session title"
        );
        assert_eq!(
            imported_thread_name("【由 Codex Desk 导入】", "会话标题"),
            "【由 Codex Desk 导入】会话标题"
        );
    }

    #[test]
    fn keeps_the_latest_five_hundred_messages_in_thread_detail() {
        let items = (0..=MAX_MESSAGES)
            .map(|index| json!({ "type": "agentMessage", "text": format!("回复 {index}") }))
            .collect::<Vec<_>>();
        let detail = normalize_thread_detail(&json!({
            "thread": {
                "id": "thread-12345678",
                "turns": [{ "items": items }]
            }
        }))
        .expect("会话详情应可归一化");

        assert!(detail.truncated);
        assert_eq!(detail.messages.len(), MAX_MESSAGES);
        assert_eq!(detail.messages[0].text, "回复 1");
    }

    #[test]
    fn trend_messages_use_the_same_latest_message_window_as_thread_detail() {
        let turns = (0..=MAX_MESSAGES)
            .map(|index| {
                json!({
                    "startedAt": if index == 0 { "2026-08-15T10:00:00+08:00" } else { "2026-08-21T10:00:00+08:00" },
                    "items": [{ "type": "agentMessage", "text": format!("回复 {index}") }]
                })
            })
            .collect::<Vec<_>>();
        let days = recent_message_days(&json!({ "turns": turns }), None);

        assert_eq!(days.len(), MAX_MESSAGES);
        assert!(days.iter().all(|day| day == "2026-08-21"));
    }
}
