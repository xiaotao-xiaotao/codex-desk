use crate::{
    account_store::QuotaTarget,
    app_server::{AppServerState, ProxySettings},
};
use futures_util::{stream, StreamExt};
use reqwest::StatusCode;
use serde::Deserialize;
use serde::Serialize;
use serde_json::Value;
use std::time::{SystemTime, UNIX_EPOCH};

/// 额度属于首页核心数据，与账户信息一样允许服务端最多 40 秒的慢响应。
const QUOTA_REQUEST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(40);
const COMPATIBILITY_USAGE_URL: &str = "https://chatgpt.com/backend-api/wham/usage";
const COMPATIBILITY_CREDITS_URL: &str = "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits";

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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountQuotaSnapshot {
    pub id: String,
    pub label: String,
    pub email: Option<String>,
    pub account_id: String,
    pub selected: bool,
    pub windows: Vec<QuotaWindow>,
    pub plan_type: Option<String>,
    pub reset_credits: Option<u64>,
    pub reset_credit_details: Vec<ResetCredit>,
    pub success: bool,
    pub error: Option<String>,
    pub queried_at: u64,
}

#[derive(Deserialize)]
struct CompatibilityResponse {
    #[serde(alias = "rateLimit")]
    rate_limit: Option<CompatibilityRateLimit>,
    #[serde(alias = "rateLimitResetCredits")]
    rate_limit_reset_credits: Option<CompatibilityCredits>,
    #[serde(alias = "planType")]
    plan_type: Option<String>,
}

#[derive(Deserialize)]
struct CompatibilityRateLimit {
    #[serde(alias = "primaryWindow")]
    primary_window: Option<CompatibilityWindow>,
    #[serde(alias = "secondaryWindow")]
    secondary_window: Option<CompatibilityWindow>,
}

#[derive(Deserialize)]
struct CompatibilityCredits {
    #[serde(alias = "availableCount")]
    available_count: Option<u64>,
    #[serde(default)]
    credits: Vec<CompatibilityCredit>,
}

#[derive(Deserialize)]
struct CompatibilityCredit {
    status: Option<String>,
    #[serde(alias = "isSupportedByPlan")]
    is_supported_by_plan: Option<bool>,
    #[serde(alias = "expiresAt")]
    expires_at: Option<String>,
}

#[derive(Deserialize)]
struct CompatibilityWindow {
    #[serde(alias = "usedPercent")]
    used_percent: Option<f64>,
    #[serde(alias = "limitWindowSeconds")]
    limit_window_seconds: Option<i64>,
    #[serde(alias = "windowDurationMins")]
    window_duration_mins: Option<i64>,
    #[serde(alias = "resetAt", alias = "resetsAt")]
    reset_at: Option<i64>,
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

/// 查询保存账户的额度。每个账户使用自己的 access token，绝不会切换当前 auth.json。
pub async fn read_account_quotas(
    targets: Vec<QuotaTarget>,
    proxy_settings: &ProxySettings,
) -> Vec<AccountQuotaSnapshot> {
    // 每批查询使用保存后的配置快照，避免一次刷新中的账户走不同代理。
    stream::iter(targets.into_iter().map(|target| query_account_quota(target, proxy_settings)))
        .buffer_unordered(2)
        .collect()
        .await
}

async fn query_account_quota(target: QuotaTarget, proxy_settings: &ProxySettings) -> AccountQuotaSnapshot {
    let queried_at = now();
    let result = match proxy_settings
        .configure_http_client(reqwest::Client::builder())
        .and_then(|builder| builder.timeout(QUOTA_REQUEST_TIMEOUT).build())
    {
        Ok(client) => {
            async {
                let response = client
                    .get(COMPATIBILITY_USAGE_URL)
                    .bearer_auth(&target.access_token)
                    .header("Accept", "application/json")
                    .header("ChatGPT-Account-Id", &target.account_id)
                    .send()
                    .await
                    .map_err(|error| {
                        if error.is_timeout() {
                            "额度查询超时".to_owned()
                        } else {
                            "无法连接额度服务".to_owned()
                        }
                    })?;
                if response.status() == StatusCode::UNAUTHORIZED
                    || response.status() == StatusCode::FORBIDDEN
                {
                    return Err("账户凭据已失效，请重新登录".to_owned());
                }
                if !response.status().is_success() {
                    return Err(format!("额度服务暂不可用（HTTP {}）", response.status()));
                }
                let mut parsed = response
                    .json::<CompatibilityResponse>()
                    .await
                    .map_err(|_| "额度服务返回了无法识别的响应".to_owned())?;
                // 充值卡到期时间由独立兼容接口返回；接口失败不影响额度窗口展示。
                if let Ok(credits_response) = client
                    .get(COMPATIBILITY_CREDITS_URL)
                    .bearer_auth(&target.access_token)
                    .header("Accept", "application/json")
                    .header("ChatGPT-Account-Id", &target.account_id)
                    .send()
                    .await
                {
                    if credits_response.status().is_success() {
                        if let Ok(credits) = credits_response.json::<CompatibilityCredits>().await {
                            parsed.rate_limit_reset_credits = Some(credits);
                        }
                    }
                }
                Ok(parsed)
            }
            .await
        }
        Err(_) => Err("无法初始化额度查询服务".to_owned()),
    };
    let base = |success, windows, plan_type, reset_credits, reset_credit_details, error| AccountQuotaSnapshot {
        id: target.id.clone(),
        label: target.label.clone(),
        email: target.email.clone(),
        account_id: target.account_id.clone(),
        selected: target.selected,
        windows,
        plan_type,
        reset_credits,
        reset_credit_details,
        success,
        error,
        queried_at,
    };
    match result {
        Ok(response) => {
            let windows: Vec<QuotaWindow> = response
                .rate_limit
                .map(|limits| {
                    [limits.primary_window, limits.secondary_window]
                        .into_iter()
                        .flatten()
                        .filter_map(normalize_compatibility_window)
                        .collect()
                })
                .unwrap_or_default();
            let credits = response.rate_limit_reset_credits;
            let reset_credit_details: Vec<ResetCredit> = credits
                .as_ref()
                .map(|value| {
                    value
                        .credits
                        .iter()
                        .filter(|credit| credit.status.as_deref() == Some("available") && credit.is_supported_by_plan.unwrap_or(true))
                        .map(|credit| ResetCredit {
                            expires_at: credit.expires_at.as_deref().and_then(parse_rfc3339_seconds),
                        })
                        .collect()
                })
                .unwrap_or_default();
            let reset_credits = credits.as_ref().map(|value| {
                value
                    .available_count
                    .unwrap_or(reset_credit_details.len() as u64)
            });
            if windows.is_empty() {
                return base(
                    false,
                    Vec::new(),
                    response.plan_type,
                    reset_credits,
                    reset_credit_details,
                    Some("账户未返回可展示的额度窗口".to_owned()),
                );
            }
            base(
                true,
                windows,
                response.plan_type,
                reset_credits,
                reset_credit_details,
                None,
            )
        }
        Err(error) => base(false, Vec::new(), None, None, Vec::new(), Some(error)),
    }
}

fn parse_rfc3339_seconds(value: &str) -> Option<i64> {
    time::OffsetDateTime::parse(value, &time::format_description::well_known::Rfc3339)
        .ok()
        .map(|date| date.unix_timestamp())
}

fn normalize_compatibility_window(window: CompatibilityWindow) -> Option<QuotaWindow> {
    let used = window
        .used_percent
        .filter(|value| value.is_finite() && (0.0..=100.0).contains(value))?;
    let duration_minutes = window.window_duration_mins.or_else(|| {
        window
            .limit_window_seconds
            .map(|seconds| (seconds + 59) / 60)
    });
    Some(QuotaWindow {
        duration_minutes,
        used_percent: Some(used),
        remaining_percent: Some(100.0 - used),
        resets_at: window.reset_at,
    })
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
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

    /// 仅验证系统 TLS 能连通额度服务，不读取本机账户或发送认证信息。
    #[cfg(windows)]
    #[test]
    #[ignore = "需要联网访问公开 HTTPS 服务"]
    fn windows_system_tls_connects_without_credentials() {
        tauri::async_runtime::block_on(async {
            let response = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(20))
                .build()
                .unwrap()
                .get(COMPATIBILITY_USAGE_URL)
                .send()
                .await
                .expect("系统 TLS 应能建立 HTTPS 连接");
            assert_eq!(response.url().scheme(), "https");
        });
    }

    #[test]
    fn reset_expiry_preserves_timezone_and_unix_second_boundaries() {
        let utc = parse_rfc3339_seconds("2026-10-25T00:00:00Z").unwrap();
        assert_eq!(parse_rfc3339_seconds("2026-10-25T08:00:00+08:00"), Some(utc));
        assert_eq!(parse_rfc3339_seconds("2026-10-24T19:00:00-05:00"), Some(utc));
        assert_eq!(parse_rfc3339_seconds("2026-10-25T00:00:00.999Z"), Some(utc));
        assert_eq!(parse_rfc3339_seconds("1969-12-31T23:59:59.5Z"), Some(-1));
        for invalid in ["", "2026-10-25", "2026-02-30T00:00:00Z", "invalid"] {
            assert_eq!(parse_rfc3339_seconds(invalid), None, "{invalid}");
        }
    }

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
