use crate::app_server::AppServerState;
use serde::Serialize;
use serde_json::Value;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsageBucket {
    /// 服务端按自然日聚合的日期，格式为 YYYY-MM-DD。
    start_date: String,
    tokens: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsageSnapshot {
    lifetime_tokens: Option<u64>,
    peak_daily_tokens: Option<u64>,
    longest_running_turn_sec: Option<u64>,
    current_streak_days: Option<u64>,
    longest_streak_days: Option<u64>,
    daily_usage_buckets: Vec<TokenUsageBucket>,
}

/// 读取 ChatGPT 账号的 Token 使用汇总与每日桶；鉴权类型不支持时由调用方展示空态。
pub async fn read_token_usage(state: &AppServerState) -> Result<TokenUsageSnapshot, String> {
    let result = state.request("account/usage/read", Value::Null).await?;
    let summary = result.get("summary").unwrap_or(&Value::Null);
    let daily_usage_buckets = result
        .get("dailyUsageBuckets")
        .and_then(Value::as_array)
        .map(|buckets| {
            buckets
                .iter()
                .filter_map(|bucket| {
                    Some(TokenUsageBucket {
                        start_date: bucket.get("startDate")?.as_str()?.to_owned(),
                        tokens: bucket.get("tokens").and_then(Value::as_u64).unwrap_or(0),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(TokenUsageSnapshot {
        lifetime_tokens: summary.get("lifetimeTokens").and_then(Value::as_u64),
        peak_daily_tokens: summary.get("peakDailyTokens").and_then(Value::as_u64),
        longest_running_turn_sec: summary
            .get("longestRunningTurnSec")
            .and_then(Value::as_u64),
        current_streak_days: summary.get("currentStreakDays").and_then(Value::as_u64),
        longest_streak_days: summary.get("longestStreakDays").and_then(Value::as_u64),
        daily_usage_buckets,
    })
}
