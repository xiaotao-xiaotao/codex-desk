use crate::app_server::AppServerState;
use serde::Serialize;
use serde_json::Value;

/// 额度属于首页核心数据，允许服务端偶发慢响应，但不影响其他 RPC 的短超时策略。
const QUOTA_REQUEST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(20);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuotaWindow {
    /// 原始窗口长度由前端按当前界面语言格式化，避免后端固定输出某一种语言。
    duration_minutes: Option<i64>,
    /// 缺失或非法的百分比为 None，不能当作未使用（剩余 100%）。
    used_percent: Option<f64>,
    remaining_percent: Option<f64>,
    resets_at: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResetCredit {
    /// 权益过期的 Unix 秒级时间戳；不存在表示该权益不设到期时间。
    expires_at: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuotaSnapshot {
    windows: Vec<QuotaWindow>,
    plan_type: Option<String>,
    /// 未返回权益数量时为 None，和明确返回 0 区分。
    reset_credits: Option<u64>,
    reset_credit_details: Vec<ResetCredit>,
}

/// 仅从当前本机已登录的 Codex CLI 读取额度；不会读取或保存 auth.json。
pub async fn read_quota(state: &AppServerState) -> Result<QuotaSnapshot, String> {
    let rate_limits = state
        .request_with_timeout(
            "account/rateLimits/read",
            Value::Null,
            QUOTA_REQUEST_TIMEOUT,
        )
        .await?;
    normalize_quota(&rate_limits)
}

fn normalize_quota(result: &Value) -> Result<QuotaSnapshot, String> {
    let limits = result
        .get("rateLimits")
        .ok_or("Codex 未返回 rateLimits 字段")?;
    let mut windows = Vec::new();
    for key in ["primary", "secondary"] {
        let Some(window) = limits.get(key).filter(|value| value.is_object()) else {
            continue;
        };
        let used_percent = window
            .get("usedPercent")
            .and_then(Value::as_f64)
            .filter(|value| value.is_finite() && (0.0..=100.0).contains(value));
        windows.push(QuotaWindow {
            duration_minutes: window.get("windowDurationMins").and_then(Value::as_i64),
            used_percent,
            remaining_percent: used_percent.map(|used| 100.0 - used),
            resets_at: window.get("resetsAt").and_then(Value::as_i64),
        });
    }
    if windows.is_empty() {
        return Err("Codex 未返回可展示的额度窗口".to_owned());
    }
    let reset_credits = result.get("rateLimitResetCredits");
    let reset_credit_details = reset_credits
        .and_then(|credits| credits.get("credits"))
        .and_then(Value::as_array)
        .map(|credits| {
            credits
                .iter()
                // 后端可能返回历史条目；首页只呈现仍可使用的额度重置权益。
                .filter(|credit| credit.get("status").and_then(Value::as_str) == Some("available"))
                .map(|credit| ResetCredit {
                    expires_at: credit.get("expiresAt").and_then(Value::as_i64),
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(QuotaSnapshot {
        windows,
        plan_type: limits
            .get("planType")
            .and_then(Value::as_str)
            .map(str::to_owned),
        reset_credits: reset_credits
            .and_then(|credits| credits.get("availableCount"))
            .and_then(Value::as_u64),
        reset_credit_details,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn distinguishes_zero_from_missing_and_invalid_percentages() {
        for used in [Value::Null, json!("20"), json!(-1), json!(101)] {
            let quota = normalize_quota(&json!({"rateLimits": {
                "primary": {"usedPercent": used}, "secondary": {"usedPercent": 0}
            }}))
            .unwrap();
            assert_eq!(quota.windows[0].used_percent, None);
            assert_eq!(quota.windows[0].remaining_percent, None);
            assert_eq!(quota.windows[1].remaining_percent, Some(100.0));
            assert_eq!(quota.reset_credits, None);
        }
        let quota = normalize_quota(&json!({"rateLimits": {"primary": {}},
            "rateLimitResetCredits": {"availableCount": 0}}))
        .unwrap();
        assert_eq!(quota.windows[0].remaining_percent, None);
        assert_eq!(quota.reset_credits, Some(0));
    }

    #[test]
    fn preserves_known_window_when_another_is_absent() {
        let quota = normalize_quota(&json!({"rateLimits": {
            "primary": null, "secondary": {"usedPercent": 100, "windowDurationMins": 10080}
        }}))
        .unwrap();
        assert_eq!(quota.windows.len(), 1);
        assert_eq!(quota.windows[0].remaining_percent, Some(0.0));
        assert_eq!(quota.windows[0].duration_minutes, Some(10080));
        assert!(normalize_quota(&json!({"rateLimits": {}})).is_err());
    }
}
