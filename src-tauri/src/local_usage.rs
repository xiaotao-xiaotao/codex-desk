use serde::Serialize;
use serde_json::Value;
use std::{
    collections::HashSet,
    env,
    path::{Path, PathBuf},
};
use tokio::{
    fs::{self, File},
    io::{AsyncBufReadExt, BufReader},
};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LocalTokenUsageBucket {
    pub start_date: String,
    pub tokens: u64,
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

/// 汇总本机会话目录中的 Token 用量；排除日期和读取上限由调用方按业务场景决定。
pub async fn read_local_daily_usage(
    excluded_days: &HashSet<String>,
    day_limit: usize,
) -> Result<Vec<LocalTokenUsageBucket>, String> {
    let sessions_root = codex_home()
        .ok_or("无法定位 Codex 本地目录")?
        .join("sessions");
    read_local_daily_usage_from(&sessions_root, excluded_days, day_limit).await
}

async fn read_local_daily_usage_from(
    sessions_root: &Path,
    excluded_days: &HashSet<String>,
    day_limit: usize,
) -> Result<Vec<LocalTokenUsageBucket>, String> {
    let mut day_directories = discover_session_day_directories(sessions_root).await?;
    day_directories.retain(|(day, _)| !excluded_days.contains(day));
    day_directories.sort_unstable_by(|left, right| right.0.cmp(&left.0));
    day_directories.truncate(day_limit);

    let mut buckets = Vec::new();
    for (start_date, directory) in day_directories {
        let tokens = read_day_total(&directory).await;
        if tokens > 0 {
            buckets.push(LocalTokenUsageBucket { start_date, tokens });
        }
    }
    Ok(buckets)
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

async fn read_day_total(directory: &Path) -> u64 {
    let mut entries = match fs::read_dir(directory).await {
        Ok(entries) => entries,
        Err(_) => return 0,
    };
    let mut total = 0_u64;
    while let Ok(Some(entry)) = entries.next_entry().await {
        let path = entry.path();
        if !path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case("jsonl"))
        {
            continue;
        }
        if let Some(tokens) = read_rollout_total(&path).await {
            total = total.saturating_add(tokens);
        }
    }
    total
}

/// 每条 token_count 都是会话累计快照，因此每个 rollout 只采用最后一条，避免重复累加。
async fn read_rollout_total(path: &Path) -> Option<u64> {
    let file = File::open(path).await.ok()?;
    let mut lines = BufReader::new(file).lines();
    let mut latest_total = None;
    while let Ok(Some(line)) = lines.next_line().await {
        if !line.contains("token_count") {
            continue;
        }
        if let Some(total) = total_tokens_from_line(&line) {
            latest_total = Some(total);
        }
    }
    latest_total
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

    let file = File::open(candidate).await.ok()?;
    let mut lines = BufReader::new(file).lines();
    let mut latest_usage = None;
    while let Ok(Some(line)) = lines.next_line().await {
        if !line.contains("token_count") {
            continue;
        }
        if let Some(usage) = thread_token_usage_from_line(&line) {
            latest_usage = Some(usage);
        }
    }
    latest_usage
}

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
    fn aggregates_latest_rollout_snapshot_and_skips_excluded_days() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("测试时间应晚于 Unix epoch")
            .as_nanos();
        let root =
            env::temp_dir().join(format!("codex-desk-usage-{}-{unique}", std::process::id()));
        let current_day = root.join("2026/08/31");
        let excluded_day = root.join("2026/08/28");
        std_fs::create_dir_all(&current_day).expect("应创建当天测试目录");
        std_fs::create_dir_all(&excluded_day).expect("应创建排除日期测试目录");
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
            excluded_day.join("rollout-excluded.jsonl"),
            "{\"payload\":{\"type\":\"token_count\",\"info\":{\"total_token_usage\":{\"total_tokens\":900}}}}\n",
        )
        .expect("应写入排除日期测试会话");

        let excluded = HashSet::from(["2026-08-28".to_owned()]);
        let buckets =
            tauri::async_runtime::block_on(read_local_daily_usage_from(&root, &excluded, 35))
                .expect("本地用量应可汇总");
        std_fs::remove_dir_all(&root).expect("应清理测试目录");

        assert_eq!(
            buckets,
            vec![LocalTokenUsageBucket {
                start_date: "2026-08-31".to_owned(),
                tokens: 150,
            }]
        );
    }
}
