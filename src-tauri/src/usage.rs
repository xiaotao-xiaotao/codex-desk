use crate::app_server::AppServerState;
use crate::local_usage::{read_local_daily_usage, LocalTokenUsageBucket};
use serde::Serialize;
use serde_json::Value;
use std::collections::{BTreeMap, HashSet};

// 图表展示近 30 天，多保留几个有会话的日期以覆盖没有会话的自然日。
const LOCAL_FALLBACK_DAY_LIMIT: usize = 35;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsageBucket {
    /// 按自然日聚合的日期，格式为 YYYY-MM-DD。
    start_date: String,
    tokens: u64,
}

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsageSnapshot {
    lifetime_tokens: Option<u64>,
    peak_daily_tokens: Option<u64>,
    longest_running_turn_sec: Option<u64>,
    current_streak_days: Option<u64>,
    longest_streak_days: Option<u64>,
    daily_usage_buckets: Vec<TokenUsageBucket>,
}

/// 优先读取账号 Token 汇总，并使用本机会话补齐服务端缺失的每日桶。
pub async fn read_token_usage(state: &AppServerState) -> Result<TokenUsageSnapshot, String> {
    let server_result = state.request("account/usage/read", Value::Null).await;
    let mut snapshot = server_result
        .as_ref()
        .map(|result| snapshot_from_server(result))
        .unwrap_or_default();
    let server_days = snapshot
        .daily_usage_buckets
        .iter()
        .map(|bucket| bucket.start_date.clone())
        .collect::<HashSet<_>>();

    match read_local_daily_usage(&server_days, LOCAL_FALLBACK_DAY_LIMIT).await {
        Ok(local_buckets) => {
            snapshot.daily_usage_buckets =
                merge_daily_buckets(snapshot.daily_usage_buckets, local_buckets);
        }
        Err(local_error) if server_result.is_err() => {
            return Err(format!(
                "{}；本地 Token 用量读取也失败：{local_error}",
                server_result.expect_err("已确认服务端请求失败")
            ));
        }
        Err(_) => {}
    }

    if snapshot.daily_usage_buckets.is_empty() {
        server_result?;
    }
    Ok(snapshot)
}

fn snapshot_from_server(result: &Value) -> TokenUsageSnapshot {
    let summary = result.get("summary").unwrap_or(&Value::Null);
    let daily_usage_buckets = result
        .get("dailyUsageBuckets")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|bucket| {
            Some(TokenUsageBucket {
                start_date: bucket.get("startDate")?.as_str()?.to_owned(),
                tokens: bucket.get("tokens").and_then(Value::as_u64).unwrap_or(0),
            })
        })
        .collect();

    TokenUsageSnapshot {
        lifetime_tokens: summary.get("lifetimeTokens").and_then(Value::as_u64),
        peak_daily_tokens: summary.get("peakDailyTokens").and_then(Value::as_u64),
        longest_running_turn_sec: summary.get("longestRunningTurnSec").and_then(Value::as_u64),
        current_streak_days: summary.get("currentStreakDays").and_then(Value::as_u64),
        longest_streak_days: summary.get("longestStreakDays").and_then(Value::as_u64),
        daily_usage_buckets,
    }
}

fn merge_daily_buckets(
    server_buckets: Vec<TokenUsageBucket>,
    local_buckets: Vec<LocalTokenUsageBucket>,
) -> Vec<TokenUsageBucket> {
    let mut merged = server_buckets
        .into_iter()
        .map(|bucket| (bucket.start_date.clone(), bucket))
        .collect::<BTreeMap<_, _>>();
    for bucket in local_buckets {
        // 服务端数据覆盖账号下所有设备；本地值只在日期缺失时补位，不能相加。
        merged
            .entry(bucket.start_date.clone())
            .or_insert(TokenUsageBucket {
                start_date: bucket.start_date,
                tokens: bucket.tokens,
            });
    }
    merged.into_values().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_usage_only_fills_missing_server_days() {
        let merged = merge_daily_buckets(
            vec![TokenUsageBucket {
                start_date: "2026-08-28".to_owned(),
                tokens: 500,
            }],
            vec![
                LocalTokenUsageBucket {
                    start_date: "2026-08-28".to_owned(),
                    tokens: 300,
                },
                LocalTokenUsageBucket {
                    start_date: "2026-08-31".to_owned(),
                    tokens: 700,
                },
            ],
        );

        assert_eq!(merged.len(), 2);
        assert_eq!(merged[0].start_date, "2026-08-28");
        assert_eq!(merged[0].tokens, 500);
        assert_eq!(merged[1].start_date, "2026-08-31");
        assert_eq!(merged[1].tokens, 700);
    }
}
