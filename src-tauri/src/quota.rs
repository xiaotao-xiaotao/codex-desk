use crate::app_server::AppServerState;
use serde::Serialize;
use serde_json::Value;

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
pub struct ResetCredit {
    /// 权益过期的 Unix 秒级时间戳；不存在表示该权益不设到期时间。
    expires_at: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuotaSnapshot {
    windows: Vec<QuotaWindow>,
    plan_type: Option<String>,
    reset_credits: u64,
    reset_credit_details: Vec<ResetCredit>,
}

/// 仅从当前本机已登录的 Codex CLI 读取额度；不会读取或保存 auth.json。
pub async fn read_quota(state: &AppServerState) -> Result<QuotaSnapshot, String> {
    let rate_limits = state
        .request("account/rateLimits/read", Value::Null)
        .await?;
    normalize_quota(&rate_limits)
}

fn normalize_quota(result: &Value) -> Result<QuotaSnapshot, String> {
    let limits = result
        .get("rateLimits")
        .ok_or("Codex 未返回 rateLimits 字段")?;
    let mut windows = Vec::new();
    for key in ["primary", "secondary"] {
        let Some(window) = limits.get(key).filter(|value| !value.is_null()) else {
            continue;
        };
        let used_percent = window
            .get("usedPercent")
            .and_then(Value::as_f64)
            .unwrap_or(0.0)
            .clamp(0.0, 100.0);
        windows.push(QuotaWindow {
            duration_minutes: window.get("windowDurationMins").and_then(Value::as_i64),
            used_percent,
            remaining_percent: 100.0 - used_percent,
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
            .and_then(Value::as_u64)
            .unwrap_or(0),
        reset_credit_details,
    })
}
