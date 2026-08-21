use crate::app_server::AppServerState;
use serde::Serialize;
use serde_json::{json, Value};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tokio::sync::Mutex;

const RECENT_THREAD_LIMIT: usize = 100;
const THREAD_PAGE_SIZE: usize = 10;
// 详情弹窗保留更完整的上下文，同时限制超长会话占用过多内存与渲染空间。
const MAX_MESSAGES: usize = 500;
const MAX_ACTIVITIES: usize = 30;
const TREND_DAY_LIMIT: usize = 7;
const TREND_CACHE_TTL: Duration = Duration::from_secs(60);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ThreadSummary {
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ThreadMessage {
    role: String,
    text: String,
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
    let threads = list_recent_threads(state).await?;
    let threads = filter_threads(threads, query);
    Ok(paginate_threads(threads, page as usize))
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
        .take(RECENT_THREAD_LIMIT)
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
