use serde::Serialize;
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    env,
    io::SeekFrom,
    path::{Path, PathBuf},
    time::SystemTime,
};
use tokio::{
    fs::{self, File},
    io::{AsyncReadExt, AsyncSeekExt},
    sync::Mutex,
};

// Token 快照通常位于 rollout 尾部；先读取尾部可避免首次洞察为每个会话通读大文件。
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
    usage: Option<ThreadTokenUsage>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LocalTokenUsageBucket {
    pub start_date: String,
    pub tokens: u64,
}

/// 单个本机会话最终保存的 Token 总量。日期来自会话文件所在目录，
/// 用于按会话统计分布，不能与按日总量重复相加。
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalSessionTokenUsage {
    pub start_date: String,
    pub tokens: u64,
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
    let _scan_guard = state.scan_lock.lock().await;
    let mut day_directories = discover_session_day_directories(sessions_root).await?;
    day_directories.sort_unstable_by(|left, right| right.0.cmp(&left.0));
    day_directories.truncate(day_limit);

    let mut daily_usage = Vec::new();
    let mut session_usage = Vec::new();
    let mut discovered_rollouts = HashSet::new();
    for (start_date, directory) in day_directories {
        let usages = read_day_session_usages(state, &directory, &mut discovered_rollouts).await;
        let day_total = usages
            .iter()
            .map(|usage| usage.total_tokens)
            .fold(0_u64, u64::saturating_add);
        if day_total > 0 {
            daily_usage.push(LocalTokenUsageBucket {
                start_date: start_date.clone(),
                tokens: day_total,
            });
        }
        for usage in usages {
            if usage.total_tokens > 0 {
                session_usage.push(LocalSessionTokenUsage {
                    start_date: start_date.clone(),
                    tokens: usage.total_tokens,
                });
            }
        }
    }

    // 目录中的文件被删除后同步清理缓存；范围外的旧缓存也不长期占用内存。
    state
        .cached_rollouts
        .lock()
        .await
        .retain(|path, _| !path.starts_with(sessions_root) || discovered_rollouts.contains(path));
    daily_usage.sort_unstable_by(|left, right| left.start_date.cmp(&right.start_date));
    session_usage.sort_unstable_by(|left, right| {
        left.start_date
            .cmp(&right.start_date)
            .then(left.tokens.cmp(&right.tokens))
    });
    Ok(LocalTokenUsageSnapshot {
        daily_usage,
        session_usage,
    })
}

async fn read_day_session_usages(
    state: &LocalUsageState,
    directory: &Path,
    discovered_rollouts: &mut HashSet<PathBuf>,
) -> Vec<ThreadTokenUsage> {
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
) -> Option<ThreadTokenUsage> {
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
    let usage = read_latest_thread_usage(path).await;
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
    let total_tokens = usage
        .get("total_tokens")
        .and_then(Value::as_u64)
        .or_else(|| input_tokens?.checked_add(output_tokens?))?;
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

    #[test]
    fn one_scan_builds_daily_and_session_usage() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("测试时间应晚于 Unix epoch")
            .as_nanos();
        let root =
            env::temp_dir().join(format!("codex-desk-usage-{}-{unique}", std::process::id()));
        let current_day = root.join("2026/08/31");
        let previous_day = root.join("2026/08/28");
        std_fs::create_dir_all(&current_day).expect("应创建当天测试目录");
        std_fs::create_dir_all(&previous_day).expect("应创建前一天测试目录");
        std_fs::write(
            current_day.join("rollout-current.jsonl"),
            concat!(
                "{\"payload\":{\"type\":\"token_count\",\"info\":{\"total_token_usage\":{\"total_tokens\":100}}}}\n",
                "{\"payload\":{\"type\":\"agent_message\"}}\n",
                "{\"payload\":{\"type\":\"token_count\",\"info\":{\"total_token_usage\":{\"total_tokens\":150}}}}\n"
            ),
        )
        .expect("应写入当天测试会话");
        std_fs::write(
            previous_day.join("rollout-previous.jsonl"),
            "{\"payload\":{\"type\":\"token_count\",\"info\":{\"total_token_usage\":{\"total_tokens\":900}}}}\n",
        )
        .expect("应写入前一天测试会话");

        let state = LocalUsageState::default();
        let usage = tauri::async_runtime::block_on(read_local_usage_from(&state, &root, 35))
            .expect("本地用量应可汇总");
        std_fs::remove_dir_all(&root).expect("应清理测试目录");

        assert_eq!(
            usage.daily_usage,
            vec![
                LocalTokenUsageBucket {
                    start_date: "2026-08-28".to_owned(),
                    tokens: 900,
                },
                LocalTokenUsageBucket {
                    start_date: "2026-08-31".to_owned(),
                    tokens: 150,
                },
            ]
        );
        assert_eq!(
            usage.session_usage,
            vec![
                LocalSessionTokenUsage {
                    start_date: "2026-08-28".to_owned(),
                    tokens: 900,
                },
                LocalSessionTokenUsage {
                    start_date: "2026-08-31".to_owned(),
                    tokens: 150,
                },
            ]
        );
    }

    #[test]
    fn keeps_one_final_total_for_each_local_session() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("测试时间应晚于 Unix epoch")
            .as_nanos();
        let root = env::temp_dir().join(format!(
            "codex-desk-session-usage-{}-{unique}",
            std::process::id()
        ));
        let day = root.join("2026/08/31");
        std_fs::create_dir_all(&day).expect("应创建测试目录");
        std_fs::write(
            day.join("rollout-small.jsonl"),
            concat!(
                "{\"payload\":{\"type\":\"token_count\",\"info\":{\"total_token_usage\":{\"total_tokens\":100}}}}\n",
                "{\"payload\":{\"type\":\"token_count\",\"info\":{\"total_token_usage\":{\"total_tokens\":8000}}}}\n"
            ),
        )
        .expect("应写入小会话快照");
        std_fs::write(
            day.join("rollout-large.jsonl"),
            "{\"payload\":{\"type\":\"token_count\",\"info\":{\"total_token_usage\":{\"total_tokens\":60000}}}}\n",
        )
        .expect("应写入大会话快照");

        let state = LocalUsageState::default();
        let usage = tauri::async_runtime::block_on(read_local_usage_from(&state, &root, 35))
            .expect("会话 Token 用量应可读取");
        std_fs::remove_dir_all(&root).expect("应清理测试目录");

        assert_eq!(
            usage.session_usage,
            vec![
                LocalSessionTokenUsage {
                    start_date: "2026-08-31".to_owned(),
                    tokens: 8000,
                },
                LocalSessionTokenUsage {
                    start_date: "2026-08-31".to_owned(),
                    tokens: 60000,
                },
            ]
        );
    }

    #[test]
    fn reuses_unchanged_cache_and_refreshes_changed_or_deleted_files() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("测试时间应晚于 Unix epoch")
            .as_nanos();
        let root = env::temp_dir().join(format!(
            "codex-desk-usage-cache-{}-{unique}",
            std::process::id()
        ));
        let day = root.join("2026/08/31");
        let rollout = day.join("rollout-cache.jsonl");
        std_fs::create_dir_all(&day).expect("应创建缓存测试目录");
        std_fs::write(
            &rollout,
            "{\"payload\":{\"type\":\"token_count\",\"info\":{\"total_token_usage\":{\"total_tokens\":100}}}}\n",
        )
        .expect("应写入缓存测试会话");

        let state = LocalUsageState::default();
        tauri::async_runtime::block_on(async {
            let first = read_local_usage_from(&state, &root, 35)
                .await
                .expect("首次扫描应成功");
            assert_eq!(first.daily_usage[0].tokens, 100);
            assert_eq!(state.parsed_file_count.load(Ordering::Relaxed), 1);

            let second = read_local_usage_from(&state, &root, 35)
                .await
                .expect("缓存扫描应成功");
            assert_eq!(second.daily_usage[0].tokens, 100);
            assert_eq!(state.parsed_file_count.load(Ordering::Relaxed), 1);

            let mut file = std_fs::OpenOptions::new()
                .append(true)
                .open(&rollout)
                .expect("应打开缓存测试会话");
            writeln!(
                file,
                "{{\"payload\":{{\"type\":\"token_count\",\"info\":{{\"total_token_usage\":{{\"total_tokens\":250}}}}}}}}"
            )
            .expect("应追加 Token 快照");
            drop(file);

            let changed = read_local_usage_from(&state, &root, 35)
                .await
                .expect("变更后扫描应成功");
            assert_eq!(changed.daily_usage[0].tokens, 250);
            assert_eq!(state.parsed_file_count.load(Ordering::Relaxed), 2);

            std_fs::remove_file(&rollout).expect("应删除缓存测试会话");
            let deleted = read_local_usage_from(&state, &root, 35)
                .await
                .expect("删除后扫描应成功");
            assert!(deleted.daily_usage.is_empty());
            assert!(state.cached_rollouts.lock().await.is_empty());
        });
        std_fs::remove_dir_all(&root).expect("应清理缓存测试目录");
    }
}
