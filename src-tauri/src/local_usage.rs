use chrono::{DateTime, Duration, Local, NaiveDate};
use serde::Serialize;
use serde_json::Value;
use std::{
    collections::{BTreeMap, HashMap, HashSet},
    env,
    io::SeekFrom,
    path::{Path, PathBuf},
    time::SystemTime,
};
use tokio::{
    fs::{self, File},
    io::{AsyncBufReadExt, AsyncReadExt, AsyncSeekExt, BufReader},
    sync::Mutex,
};

// 会话详情只需最终快照，先读取尾部；按日统计则必须读取事件序列。
const TOKEN_USAGE_TAIL_WINDOW_BYTES: u64 = 64 * 1024;

#[derive(Default)]
pub struct LocalUsageState {
    /// 同一时刻只执行一轮目录扫描，避免自动刷新和手动刷新并发争用磁盘。
    scan_lock: Mutex<()>,
    cached_rollouts: Mutex<HashMap<PathBuf, CachedRolloutUsage>>,
    #[cfg(test)]
    parsed_file_count: std::sync::atomic::AtomicUsize,
}

#[derive(Clone)]
struct CachedRolloutUsage {
    file_len: u64,
    modified_at: Option<SystemTime>,
    usage: Option<Vec<LocalTokenUsageBucket>>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalTokenUsageBucket {
    pub start_date: String,
    pub tokens: u64,
}

/// 单个本机会话按实际使用日拆分的增量；分布图只统计选定区间内的消耗。
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalSessionTokenUsage {
    pub daily_usage: Vec<LocalTokenUsageBucket>,
}

pub struct LocalTokenUsageSnapshot {
    pub daily_usage: Vec<LocalTokenUsageBucket>,
    pub session_usage: Vec<LocalSessionTokenUsage>,
}

/// 单个会话最后一条 Token 快照。缓存输入与推理输出分别是输入、输出的子集，
/// 仅用于明细展示，不能再次累加到总量。
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThreadTokenUsage {
    input_tokens: u64,
    cached_input_tokens: u64,
    output_tokens: u64,
    reasoning_output_tokens: u64,
    total_tokens: u64,
}

/// 一次目录扫描同时生成按日、按会话两组 Token 数据，避免洞察刷新重复读取 rollout。
pub async fn read_local_usage(
    state: &LocalUsageState,
    day_limit: usize,
) -> Result<LocalTokenUsageSnapshot, String> {
    let sessions_root = codex_home()
        .ok_or("无法定位 Codex 本地目录")?
        .join("sessions");
    read_local_usage_from(state, &sessions_root, day_limit).await
}

async fn read_local_usage_from(
    state: &LocalUsageState,
    sessions_root: &Path,
    day_limit: usize,
) -> Result<LocalTokenUsageSnapshot, String> {
    read_local_usage_at(state, sessions_root, day_limit, Local::now().date_naive()).await
}

async fn read_local_usage_at(
    state: &LocalUsageState,
    sessions_root: &Path,
    day_limit: usize,
    today: NaiveDate,
) -> Result<LocalTokenUsageSnapshot, String> {
    let _scan_guard = state.scan_lock.lock().await;
    let day_directories = discover_session_day_directories(sessions_root).await?;
    // 0 表示不限制历史起点，供按月浏览使用；仍排除未来日期。
    let first_day = if day_limit == 0 {
        NaiveDate::MIN
    } else {
        today - Duration::days(day_limit.saturating_sub(1) as i64)
    };
    let first_key = first_day.to_string();
    let last_key = today.to_string();
    let mut totals = BTreeMap::<String, u64>::new();
    let mut session_usage = Vec::new();
    let mut discovered_rollouts = HashSet::new();
    for (_, directory) in day_directories {
        // 旧目录中的会话也可能最近续聊；按文件修改日筛选，不能按创建目录截断。
        let usages =
            read_day_session_usages(state, &directory, first_day, &mut discovered_rollouts).await;
        for usage in usages {
            let daily_usage: Vec<_> = usage
                .into_iter()
                .filter(|bucket| {
                    (day_limit == 0 || bucket.start_date >= first_key)
                        && bucket.start_date <= last_key
                })
                .collect();
            for bucket in &daily_usage {
                let total = totals.entry(bucket.start_date.clone()).or_default();
                *total = total.saturating_add(bucket.tokens);
            }
            if !daily_usage.is_empty() {
                session_usage.push(LocalSessionTokenUsage { daily_usage });
            }
        }
    }

    // 目录中的文件被删除后同步清理缓存；范围外的旧缓存也不长期占用内存。
    state
        .cached_rollouts
        .lock()
        .await
        .retain(|path, _| !path.starts_with(sessions_root) || discovered_rollouts.contains(path));
    let daily_usage = totals
        .into_iter()
        .map(|(start_date, tokens)| LocalTokenUsageBucket { start_date, tokens })
        .collect();
    Ok(LocalTokenUsageSnapshot {
        daily_usage,
        session_usage,
    })
}

async fn read_day_session_usages(
    state: &LocalUsageState,
    directory: &Path,
    first_day: NaiveDate,
    discovered_rollouts: &mut HashSet<PathBuf>,
) -> Vec<Vec<LocalTokenUsageBucket>> {
    let mut entries = match fs::read_dir(directory).await {
        Ok(entries) => entries,
        Err(_) => return Vec::new(),
    };
    let mut usages = Vec::new();
    while let Ok(Some(entry)) = entries.next_entry().await {
        let path = entry.path();
        if !path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case("jsonl"))
        {
            continue;
        }
        let Ok(metadata) = entry.metadata().await else {
            continue;
        };
        if metadata
            .modified()
            .ok()
            .is_some_and(|modified| DateTime::<Local>::from(modified).date_naive() < first_day)
        {
            continue;
        }
        discovered_rollouts.insert(path.clone());
        if let Some(usage) = read_cached_rollout_usage(state, &path).await {
            usages.push(usage);
        }
    }
    usages
}

fn codex_home() -> Option<PathBuf> {
    env::var_os("CODEX_HOME")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .or_else(|| {
            #[cfg(target_os = "windows")]
            let profile = env::var_os("USERPROFILE");
            #[cfg(not(target_os = "windows"))]
            let profile = env::var_os("HOME");
            profile
                .filter(|value| !value.is_empty())
                .map(|value| PathBuf::from(value).join(".codex"))
        })
}

async fn discover_session_day_directories(
    sessions_root: &Path,
) -> Result<Vec<(String, PathBuf)>, String> {
    let mut days = Vec::new();
    let mut years = match fs::read_dir(sessions_root).await {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(days),
        Err(error) => return Err(format!("无法读取 Codex 会话目录：{error}")),
    };

    while let Some(year) = years
        .next_entry()
        .await
        .map_err(|error| format!("无法遍历 Codex 会话年份：{error}"))?
    {
        let Some(year_name) = numeric_directory_name(&year, 4, 0, 9999).await else {
            continue;
        };
        let mut months = match fs::read_dir(year.path()).await {
            Ok(entries) => entries,
            Err(_) => continue,
        };
        while let Ok(Some(month)) = months.next_entry().await {
            let Some(month_name) = numeric_directory_name(&month, 2, 1, 12).await else {
                continue;
            };
            let mut month_days = match fs::read_dir(month.path()).await {
                Ok(entries) => entries,
                Err(_) => continue,
            };
            while let Ok(Some(day)) = month_days.next_entry().await {
                let Some(day_name) = numeric_directory_name(&day, 2, 1, 31).await else {
                    continue;
                };
                days.push((format!("{year_name}-{month_name}-{day_name}"), day.path()));
            }
        }
    }
    Ok(days)
}

async fn numeric_directory_name(
    entry: &fs::DirEntry,
    expected_length: usize,
    minimum: u32,
    maximum: u32,
) -> Option<String> {
    if !entry.file_type().await.ok()?.is_dir() {
        return None;
    }
    let name = entry.file_name().to_str()?.to_owned();
    if name.len() != expected_length || !name.bytes().all(|value| value.is_ascii_digit()) {
        return None;
    }
    let value = name.parse::<u32>().ok()?;
    (minimum..=maximum).contains(&value).then_some(name)
}

async fn read_cached_rollout_usage(
    state: &LocalUsageState,
    path: &Path,
) -> Option<Vec<LocalTokenUsageBucket>> {
    let metadata = fs::metadata(path).await.ok()?;
    if !metadata.is_file() {
        return None;
    }
    let file_len = metadata.len();
    let modified_at = metadata.modified().ok();
    {
        let cache = state.cached_rollouts.lock().await;
        if let Some(cached) = cache.get(path) {
            if cached.file_len == file_len && cached.modified_at == modified_at {
                return cached.usage.clone();
            }
        }
    }

    #[cfg(test)]
    state
        .parsed_file_count
        .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let usage = read_rollout_daily_usage(path).await;
    state.cached_rollouts.lock().await.insert(
        path.to_path_buf(),
        CachedRolloutUsage {
            file_len,
            modified_at,
            usage: usage.clone(),
        },
    );
    usage
}

#[derive(Default)]
struct DailyUsageAccumulator {
    previous_total: Option<u64>,
    /// 首个累计快照出现前已计入的本次量，防止字段恢复后再次计入。
    unbased_last_tokens: u64,
    last_only_events: HashSet<String>,
    daily: BTreeMap<String, u64>,
}

fn usage_total(usage: &Value) -> Option<u64> {
    usage
        .get("total_tokens")
        .and_then(Value::as_u64)
        .or_else(|| {
            usage
                .get("input_tokens")?
                .as_u64()?
                .checked_add(usage.get("output_tokens")?.as_u64()?)
        })
}

impl DailyUsageAccumulator {
    fn add_line(&mut self, line: &str) {
        if !line.contains("token_count") {
            return;
        }
        let Ok(event) = serde_json::from_str::<Value>(line) else {
            return;
        };
        let payload = &event["payload"];
        if payload["type"].as_str() != Some("token_count") {
            return;
        }
        let info = &payload["info"];
        let total = usage_total(&info["total_token_usage"]);
        let last = usage_total(&info["last_token_usage"]);
        // 某条事件重放时可能丢失累计字段，仍按同一事件时间和本次明细识别重复。
        let repeated_last = last.is_some()
            && !self.last_only_events.insert(format!(
                "{}:{}",
                event["timestamp"], info["last_token_usage"]
            ));
        let increment = match total {
            Some(total) => {
                let increment = match self.previous_total {
                    // 首个事件可能继承了分支或恢复会话的累计基数，优先用明确的本次消耗。
                    None if repeated_last => 0,
                    None => last.unwrap_or_else(|| total.saturating_sub(self.unbased_last_tokens)),
                    Some(previous) if total >= previous => total - previous,
                    // 压缩或重置后的累计下降不是新增消耗，只接受明确的本次量。
                    Some(_) if repeated_last => 0,
                    Some(_) => last.unwrap_or(0),
                };
                self.previous_total = Some(total);
                increment
            }
            None => {
                // 没有累计值时，仅对有事件时间的本次快照计数，相同事件重放不重复累加。
                let Some(last) = last else { return };
                if repeated_last {
                    return;
                }
                // 本次量已计入，后续恢复累计字段时应从这次消耗后的基线计算。
                if let Some(previous) = self.previous_total.as_mut() {
                    *previous = previous.saturating_add(last);
                } else {
                    self.unbased_last_tokens = self.unbased_last_tokens.saturating_add(last);
                }
                last
            }
        };
        // 时间无效时仍更新累计基线，避免下一条把无法归档的消耗带入错误日期。
        let Some(date) = event["timestamp"]
            .as_str()
            .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
            .map(|value| value.with_timezone(&Local).date_naive().to_string())
        else {
            return;
        };
        if increment > 0 {
            let tokens = self.daily.entry(date).or_default();
            *tokens = tokens.saturating_add(increment);
        }
    }

    fn into_buckets(self) -> Vec<LocalTokenUsageBucket> {
        self.daily
            .into_iter()
            .map(|(start_date, tokens)| LocalTokenUsageBucket { start_date, tokens })
            .collect()
    }
}

async fn read_rollout_daily_usage(path: &Path) -> Option<Vec<LocalTokenUsageBucket>> {
    let mut lines = BufReader::new(File::open(path).await.ok()?).lines();
    let mut usage = DailyUsageAccumulator::default();
    while let Some(line) = lines.next_line().await.ok()? {
        usage.add_line(&line);
    }
    Some(usage.into_buckets())
}

async fn read_latest_thread_usage(path: &Path) -> Option<ThreadTokenUsage> {
    let mut file = File::open(path).await.ok()?;
    let file_len = file.metadata().await.ok()?.len();
    if file_len == 0 {
        return None;
    }

    let mut window_len = TOKEN_USAGE_TAIL_WINDOW_BYTES.min(file_len);
    loop {
        let start = file_len.saturating_sub(window_len);
        file.seek(SeekFrom::Start(start)).await.ok()?;
        let mut buffer = Vec::with_capacity(window_len as usize);
        file.read_to_end(&mut buffer).await.ok()?;
        let content = String::from_utf8_lossy(&buffer);
        // 非文件开头处的第一行可能被截断，扩大窗口后再解析它，避免把残缺 JSON 当快照。
        let searchable = if start == 0 {
            content.as_ref()
        } else {
            content
                .split_once('\n')
                .map_or("", |(_, complete_lines)| complete_lines)
        };
        for line in searchable.lines().rev() {
            if line.contains("token_count") {
                if let Some(usage) = thread_token_usage_from_line(line) {
                    return Some(usage);
                }
            }
        }
        if start == 0 {
            return None;
        }
        window_len = window_len.saturating_mul(2).min(file_len);
    }
}

/// 读取 App Server 返回的会话文件路径，并限制在本机 Codex sessions 目录内。
pub async fn read_thread_token_usage(thread_path: &str) -> Option<ThreadTokenUsage> {
    let sessions_root = codex_home()?.join("sessions");
    let candidate = PathBuf::from(thread_path);
    let candidate = if candidate.is_absolute() {
        candidate
    } else {
        codex_home()?.join(candidate)
    };
    if !candidate
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("jsonl"))
    {
        return None;
    }
    let sessions_root = fs::canonicalize(sessions_root).await.ok()?;
    let candidate = fs::canonicalize(candidate).await.ok()?;
    if !candidate.starts_with(&sessions_root) {
        return None;
    }
    read_latest_thread_usage(&candidate).await
}

#[cfg(test)]
fn total_tokens_from_line(line: &str) -> Option<u64> {
    thread_token_usage_from_line(line).map(|usage| usage.total_tokens)
}

fn thread_token_usage_from_line(line: &str) -> Option<ThreadTokenUsage> {
    let event: Value = serde_json::from_str(line).ok()?;
    let payload = event.get("payload")?;
    if payload.get("type").and_then(Value::as_str) != Some("token_count") {
        return None;
    }
    let usage = payload.get("info")?.get("total_token_usage")?;
    let input_tokens = usage.get("input_tokens").and_then(Value::as_u64);
    let output_tokens = usage.get("output_tokens").and_then(Value::as_u64);
    let total_tokens = usage_total(usage)?;
    Some(ThreadTokenUsage {
        input_tokens: input_tokens.unwrap_or(0),
        cached_input_tokens: usage
            .get("cached_input_tokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        output_tokens: output_tokens.unwrap_or(0),
        reasoning_output_tokens: usage
            .get("reasoning_output_tokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        total_tokens,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs as std_fs,
        io::Write,
        sync::atomic::Ordering,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn reads_total_tokens_from_token_count_event() {
        let line = r#"{"type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":120,"cached_input_tokens":80,"output_tokens":30,"reasoning_output_tokens":10,"total_tokens":150}}}}"#;

        assert_eq!(total_tokens_from_line(line), Some(150));
    }

    #[test]
    fn keeps_token_breakdown_for_session_details() {
        let line = r#"{"payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":120,"cached_input_tokens":80,"output_tokens":30,"reasoning_output_tokens":10,"total_tokens":150}}}}"#;
        let usage = thread_token_usage_from_line(line).expect("Token 快照应可读取");

        assert_eq!(usage.input_tokens, 120);
        assert_eq!(usage.cached_input_tokens, 80);
        assert_eq!(usage.output_tokens, 30);
        assert_eq!(usage.reasoning_output_tokens, 10);
        assert_eq!(usage.total_tokens, 150);
    }

    #[test]
    fn derives_total_without_double_counting_usage_subsets() {
        let line = r#"{"payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":120,"cached_input_tokens":80,"output_tokens":30,"reasoning_output_tokens":10}}}}"#;

        assert_eq!(total_tokens_from_line(line), Some(150));
    }

    #[test]
    fn ignores_unrelated_or_malformed_events() {
        assert_eq!(
            total_tokens_from_line(r#"{"payload":{"type":"agent_message"}}"#),
            None
        );
        assert_eq!(total_tokens_from_line("not-json"), None);
    }

    fn event(day: &str, total: Option<u64>, last: Option<u64>) -> String {
        use chrono::TimeZone;
        let date = NaiveDate::parse_from_str(day, "%Y-%m-%d").unwrap();
        let timestamp = Local
            .from_local_datetime(&date.and_hms_opt(12, 0, 0).unwrap())
            .single()
            .unwrap()
            .to_rfc3339();
        serde_json::json!({
            "timestamp": timestamp,
            "payload": {"type": "token_count", "info": {
                "total_token_usage": total.map(|tokens| serde_json::json!({"total_tokens": tokens})),
                "last_token_usage": last.map(|tokens| serde_json::json!({"total_tokens": tokens}))
            }}
        }).to_string()
    }

    fn bucket(day: &str, tokens: u64) -> LocalTokenUsageBucket {
        LocalTokenUsageBucket {
            start_date: day.to_owned(),
            tokens,
        }
    }

    #[test]
    fn splits_cross_day_usage_and_ignores_duplicate_totals() {
        let mut usage = DailyUsageAccumulator::default();
        usage.add_line(&event("2026-08-30", Some(100), None));
        usage.add_line(&event("2026-08-31", Some(150), Some(50)));
        usage.add_line(&event("2026-08-31", Some(150), Some(50)));
        assert_eq!(
            usage.into_buckets(),
            vec![bucket("2026-08-30", 100), bucket("2026-08-31", 50)]
        );
    }

    #[test]
    fn handles_inherited_totals_resets_and_last_only_duplicates() {
        let mut usage = DailyUsageAccumulator::default();
        usage.add_line(&event("2026-08-31", Some(1000), Some(20)));
        usage.add_line(&event("2026-08-31", Some(50), Some(5)));
        let last_only = event("2026-08-31", None, Some(10));
        usage.add_line(&last_only);
        usage.add_line(&last_only);
        usage.add_line(&event("2026-08-31", Some(70), Some(10)));
        assert_eq!(usage.into_buckets(), vec![bucket("2026-08-31", 45)]);
    }

    #[test]
    fn invalid_timestamp_updates_baseline_without_assigning_a_day() {
        let mut usage = DailyUsageAccumulator::default();
        let mut missing: Value =
            serde_json::from_str(&event("2026-08-30", Some(100), None)).unwrap();
        missing.as_object_mut().unwrap().remove("timestamp");
        usage.add_line(&missing.to_string());
        missing["timestamp"] = Value::String("invalid".into());
        missing["payload"]["info"]["total_token_usage"]["total_tokens"] = Value::from(120);
        usage.add_line(&missing.to_string());
        missing["payload"]["info"]["total_token_usage"] = Value::Null;
        missing["payload"]["info"]["last_token_usage"] = serde_json::json!({"total_tokens": 10});
        usage.add_line(&missing.to_string());
        usage.add_line(&event("2026-08-31", Some(150), None));
        assert_eq!(usage.into_buckets(), vec![bucket("2026-08-31", 20)]);
    }

    #[test]
    fn restored_cumulative_field_does_not_recount_last_only_usage() {
        let mut usage = DailyUsageAccumulator::default();
        usage.add_line(&event("2026-08-31", None, Some(20)));
        usage.add_line(&event("2026-08-31", Some(1000), Some(20)));
        usage.add_line(&event("2026-08-31", Some(1030), Some(30)));
        usage.add_line(&event("2026-08-31", None, Some(30)));
        assert_eq!(usage.into_buckets(), vec![bucket("2026-08-31", 50)]);

        let mut usage = DailyUsageAccumulator::default();
        usage.add_line(&event("2026-08-31", None, Some(20)));
        usage.add_line(&event("2026-08-31", Some(50), None));
        assert_eq!(usage.into_buckets(), vec![bucket("2026-08-31", 50)]);
    }

    #[test]
    fn timestamp_uses_local_date_instead_of_utc_date() {
        let timestamp = "2026-08-30T23:30:00Z";
        let expected = DateTime::parse_from_rfc3339(timestamp)
            .unwrap()
            .with_timezone(&Local)
            .date_naive()
            .to_string();
        let line = serde_json::json!({"timestamp": timestamp, "payload": {
            "type": "token_count", "info": {"total_token_usage": {"total_tokens": 40}}
        }})
        .to_string();
        let mut usage = DailyUsageAccumulator::default();
        usage.add_line(&line);
        assert_eq!(usage.into_buckets(), vec![bucket(&expected, 40)]);
    }

    #[test]
    fn scans_old_session_directories_and_limits_actual_usage_days() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root =
            env::temp_dir().join(format!("codex-desk-usage-{}-{unique}", std::process::id()));
        let directory = root.join("2025/01/01");
        std_fs::create_dir_all(&directory).unwrap();
        let path = directory.join("rollout-old.jsonl");
        // 文件修改时间来自实际系统时钟，事件日期也使用相对今天，避免测试随日期失效。
        let today = Local::now().date_naive();
        let old_day = (today - Duration::days(40)).to_string();
        let previous_day = (today - Duration::days(1)).to_string();
        let current_day = today.to_string();
        let future_day = (today + Duration::days(1)).to_string();
        std_fs::write(
            &path,
            [
                event(&old_day, Some(900), None),
                event(&previous_day, Some(1000), None),
                event(&current_day, Some(1050), None),
                event(&future_day, Some(1080), None),
            ]
            .join("\n"),
        )
        .unwrap();
        let state = LocalUsageState::default();
        tauri::async_runtime::block_on(async {
            let usage = read_local_usage_at(&state, &root, 2, today).await.unwrap();
            assert_eq!(
                usage.daily_usage,
                vec![bucket(&previous_day, 100), bucket(&current_day, 50)]
            );
            assert_eq!(
                usage.session_usage,
                vec![LocalSessionTokenUsage {
                    daily_usage: usage.daily_usage.clone()
                }]
            );
            let history = read_local_usage_at(&state, &root, 0, today).await.unwrap();
            assert_eq!(
                history.daily_usage,
                vec![
                    bucket(&old_day, 900),
                    bucket(&previous_day, 100),
                    bucket(&current_day, 50)
                ]
            );
            assert!(history
                .daily_usage
                .iter()
                .all(|day| day.start_date <= current_day));
            assert_eq!(state.parsed_file_count.load(Ordering::Relaxed), 1);
            assert_eq!(
                read_latest_thread_usage(&path).await.unwrap().total_tokens,
                1080
            );
        });
        std_fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn reuses_unchanged_cache_and_refreshes_changed_or_deleted_files() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = env::temp_dir().join(format!(
            "codex-desk-usage-cache-{}-{unique}",
            std::process::id()
        ));
        let day = root.join("2026/08/31");
        let rollout = day.join("rollout-cache.jsonl");
        std_fs::create_dir_all(&day).unwrap();
        let today = Local::now().date_naive();
        let current_day = today.to_string();
        std_fs::write(
            &rollout,
            format!("{}\n", event(&current_day, Some(100), None)),
        )
        .unwrap();
        let state = LocalUsageState::default();
        tauri::async_runtime::block_on(async {
            let first = read_local_usage_at(&state, &root, 35, today).await.unwrap();
            assert_eq!(first.daily_usage[0].tokens, 100);
            assert_eq!(state.parsed_file_count.load(Ordering::Relaxed), 1);
            let second = read_local_usage_at(&state, &root, 35, today).await.unwrap();
            assert_eq!(second.daily_usage[0].tokens, 100);
            assert_eq!(state.parsed_file_count.load(Ordering::Relaxed), 1);
            let mut file = std_fs::OpenOptions::new()
                .append(true)
                .open(&rollout)
                .unwrap();
            writeln!(file, "{}", event(&current_day, Some(250), None)).unwrap();
            drop(file);
            let changed = read_local_usage_at(&state, &root, 35, today).await.unwrap();
            assert_eq!(changed.daily_usage[0].tokens, 250);
            assert_eq!(state.parsed_file_count.load(Ordering::Relaxed), 2);
            std_fs::remove_file(&rollout).unwrap();
            let deleted = read_local_usage_at(&state, &root, 35, today).await.unwrap();
            assert!(deleted.daily_usage.is_empty());
            assert!(state.cached_rollouts.lock().await.is_empty());
        });
        std_fs::remove_dir_all(root).unwrap();
    }
}
