use crate::{account_store::QuotaTarget, http_client, oauth};
use futures_util::{stream, StreamExt};
use reqwest::StatusCode;
use serde::Deserialize;
use serde::Serialize;
use serde_json::Value;
use std::time::{SystemTime, UNIX_EPOCH};

/// 额度属于首页核心数据，与账户信息一样允许服务端最多 40 秒的慢响应。
pub const QUOTA_REQUEST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(40);
const MAX_CONCURRENT_QUERIES: usize = 2;
const MAX_GET_ATTEMPTS: usize = 2;
const GET_RETRY_DELAY: std::time::Duration = std::time::Duration::from_millis(400);
const MAX_RETRY_AFTER_SECONDS: u64 = 5;
const COMPATIBILITY_USAGE_URL: &str = "https://chatgpt.com/backend-api/wham/usage";
const COMPATIBILITY_CREDITS_URL: &str =
    "https://chatgpt.com/backend-api/wham/rate-limit-reset-credits";

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
    pub reset_credits_error: Option<String>,
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

/// 整批只返回一份查询结果；凭据更新由命令层持锁提交，认证信息不参与 IPC 序列化。
pub(crate) struct QuotaOutcome {
    pub snapshot: AccountQuotaSnapshot,
    pub target: QuotaTarget,
    pub refreshed_auth: Option<Value>,
}

struct Endpoints<'a> {
    usage: &'a str,
    credits: &'a str,
    token: &'a str,
}

#[derive(Debug)]
enum QueryError {
    Unauthorized,
    Message(String),
}

impl QueryError {
    fn message(self) -> String {
        match self {
            Self::Unauthorized => "账户凭据已失效，请重新登录".into(),
            Self::Message(message) => message,
        }
    }
}

pub(crate) async fn read_account_quotas(
    targets: Vec<QuotaTarget>,
    client: &reqwest::Client,
) -> Vec<QuotaOutcome> {
    let endpoints = Endpoints {
        usage: COMPATIBILITY_USAGE_URL,
        credits: COMPATIBILITY_CREDITS_URL,
        token: oauth::TOKEN_URL,
    };
    stream::iter(
        targets
            .into_iter()
            .map(|target| query_account_quota(target, client, &endpoints)),
    )
    .buffer_unordered(MAX_CONCURRENT_QUERIES)
    .collect()
    .await
}

async fn send_quota_request(
    client: &reqwest::Client,
    url: &str,
    auth: &Value,
    account_id: &str,
) -> Result<reqwest::Response, QueryError> {
    let token = auth
        .pointer("/tokens/access_token")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| QueryError::Message("缺少访问凭据，请重新登录".into()))?;
    for attempt in 0..MAX_GET_ATTEMPTS {
        let response = client
            .get(url)
            .bearer_auth(token)
            .header("Accept", "application/json")
            .header("ChatGPT-Account-Id", account_id)
            .send()
            .await;
        match response {
            Ok(response) => {
                if attempt == 0
                    && (response.status() == StatusCode::TOO_MANY_REQUESTS
                        || response.status().is_server_error())
                {
                    let delay = response
                        .headers()
                        .get("Retry-After")
                        .and_then(|value| value.to_str().ok())
                        .and_then(|value| value.parse::<u64>().ok());
                    if delay.is_none_or(|seconds| seconds <= MAX_RETRY_AFTER_SECONDS) {
                        drop(response);
                        tokio::time::sleep(
                            delay
                                .map(std::time::Duration::from_secs)
                                .unwrap_or(GET_RETRY_DELAY),
                        )
                        .await;
                        continue;
                    }
                }
                return match response.status() {
                    StatusCode::UNAUTHORIZED => Err(QueryError::Unauthorized),
                    StatusCode::FORBIDDEN => Err(QueryError::Message(
                        "额度服务拒绝访问（HTTP 403），请检查网络或账户权限".into(),
                    )),
                    StatusCode::TOO_MANY_REQUESTS => {
                        Err(QueryError::Message("额度查询过于频繁，请稍后重试".into()))
                    }
                    status if !status.is_success() => Err(QueryError::Message(format!(
                        "额度服务暂不可用（HTTP {status}）"
                    ))),
                    _ => Ok(response),
                };
            }
            Err(error) if attempt == 0 && (error.is_connect() || error.is_timeout()) => {
                tokio::time::sleep(GET_RETRY_DELAY).await;
            }
            Err(error) => {
                return Err(QueryError::Message(http_client::network_error(
                    "额度服务",
                    &error,
                )))
            }
        }
    }
    unreachable!("GET 请求最多重试一次")
}

async fn query_details(
    client: &reqwest::Client,
    auth: &Value,
    account_id: &str,
    endpoints: &Endpoints<'_>,
) -> Result<(CompatibilityResponse, Option<String>), QueryError> {
    let response = send_quota_request(client, endpoints.usage, auth, account_id).await?;
    let mut result = response
        .json::<CompatibilityResponse>()
        .await
        .map_err(|_| QueryError::Message("额度服务返回了无法识别的响应".into()))?;
    // 重置卡属于辅助信息，失败不能把有效的额度窗口一并抹掉。
    let credits_error = match send_quota_request(client, endpoints.credits, auth, account_id).await
    {
        Ok(response) => match response.json::<CompatibilityCredits>().await {
            Ok(credits) => {
                result.rate_limit_reset_credits = Some(credits);
                None
            }
            Err(_) => Some("重置卡服务返回了无法识别的响应".into()),
        },
        Err(error) => Some(error.message()),
    };
    Ok((result, credits_error))
}

async fn query_account_quota(
    target: QuotaTarget,
    client: &reqwest::Client,
    endpoints: &Endpoints<'_>,
) -> QuotaOutcome {
    let mut result = query_details(client, &target.auth, &target.account_id, endpoints).await;
    let mut refreshed_auth = None;
    if matches!(result, Err(QueryError::Unauthorized)) {
        match oauth::refresh_auth_at(client, &target.auth, endpoints.token).await {
            Ok(auth) => {
                result = query_details(client, &auth, &target.account_id, endpoints).await;
                // 即使重试额度失败，也必须保存已经轮换的新令牌。
                refreshed_auth = Some(auth);
            }
            Err(error) => result = Err(QueryError::Message(error)),
        }
    }
    let mut snapshot = AccountQuotaSnapshot {
        id: target.id.clone(),
        label: target.label.clone(),
        email: target.email.clone(),
        account_id: target.account_id.clone(),
        selected: target.selected,
        windows: Vec::new(),
        plan_type: None,
        reset_credits: None,
        reset_credit_details: Vec::new(),
        reset_credits_error: None,
        success: false,
        error: None,
        queried_at: now(),
    };
    match result {
        Ok((response, credits_error)) => {
            snapshot.reset_credits_error = credits_error;
            snapshot.windows = response
                .rate_limit
                .map(|limits| {
                    [limits.primary_window, limits.secondary_window]
                        .into_iter()
                        .flatten()
                        .filter_map(normalize_compatibility_window)
                        .collect()
                })
                .unwrap_or_default();
            snapshot.plan_type = response.plan_type;
            if let Some(credits) = response.rate_limit_reset_credits {
                snapshot.reset_credit_details = credits
                    .credits
                    .iter()
                    .filter(|credit| {
                        credit.status.as_deref() == Some("available")
                            && credit.is_supported_by_plan.unwrap_or(true)
                    })
                    .map(|credit| ResetCredit {
                        expires_at: credit.expires_at.as_deref().and_then(parse_rfc3339_seconds),
                    })
                    .collect();
                snapshot.reset_credits = Some(
                    credits
                        .available_count
                        .unwrap_or(snapshot.reset_credit_details.len() as u64),
                );
            }
            snapshot.success = !snapshot.windows.is_empty();
            if !snapshot.success {
                snapshot.error = Some("账户未返回可展示的额度窗口".into());
            }
        }
        Err(error) => snapshot.error = Some(error.message()),
    }
    QuotaOutcome {
        snapshot,
        target,
        refreshed_auth,
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
    let duration_minutes = window
        .window_duration_mins
        .filter(|minutes| *minutes > 0)
        .or_else(|| {
            window
                .limit_window_seconds
                .filter(|seconds| *seconds > 0)
                .and_then(|seconds| seconds.checked_add(59))
                .map(|seconds| seconds / 60)
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

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    // 只连接随机回环端口，使用虚构凭据核对完整请求序列，不触及真实授权服务。
    fn serve(script: Vec<(u16, &'static str)>) -> (String, std::thread::JoinHandle<Vec<String>>) {
        use std::{
            io::{BufRead, BufReader, Read, Write},
            net::TcpListener,
            time::{Duration, Instant},
        };
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        listener.set_nonblocking(true).unwrap();
        let server = std::thread::spawn(move || {
            let mut requests = Vec::new();
            for (status, body) in script {
                let deadline = Instant::now() + Duration::from_secs(5);
                let mut stream = loop {
                    match listener.accept() {
                        Ok((stream, _)) => break stream,
                        Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                            assert!(Instant::now() < deadline, "未收到预期 HTTP 请求");
                            std::thread::sleep(Duration::from_millis(5));
                        }
                        Err(error) => panic!("测试服务接收失败：{error}"),
                    }
                };
                stream.set_nonblocking(false).unwrap();
                stream
                    .set_read_timeout(Some(Duration::from_secs(2)))
                    .unwrap();
                let mut reader = BufReader::new(&mut stream);
                let mut request = String::new();
                let mut length = 0;
                loop {
                    let mut line = String::new();
                    assert!(reader.read_line(&mut line).unwrap() > 0);
                    if let Some(value) = line.to_lowercase().strip_prefix("content-length:") {
                        length = value.trim().parse().unwrap();
                    }
                    request.push_str(&line);
                    if line == "\r\n" {
                        break;
                    }
                }
                let mut payload = vec![0; length];
                reader.read_exact(&mut payload).unwrap();
                request.push_str(&String::from_utf8(payload).unwrap());
                requests.push(request.to_lowercase());
                drop(reader);
                write!(stream, "HTTP/1.1 {status} Test\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).unwrap();
            }
            requests
        });
        (url, server)
    }

    fn target() -> QuotaTarget {
        QuotaTarget {
            id: "test-account".into(),
            label: "测试账户".into(),
            email: None,
            account_id: "workspace".into(),
            selected: true,
            saved_auth: None,
            auth: json!({"auth_mode":"chatgpt", "tokens":{"account_id":"workspace", "access_token":"old-access", "refresh_token":"old-refresh"}}),
        }
    }

    const USAGE: &str = r#"{"plan_type":"plus","rate_limit":{"primary_window":{"used_percent":25,"limit_window_seconds":18000,"reset_at":123}}}"#;
    const ROTATED: &str = r#"{"access_token":"next-access","refresh_token":"next-refresh"}"#;
    const CREDITS: &str = r#"{"available_count":1,"credits":[{"status":"available","expires_at":"2026-10-30T00:00:00Z"}]}"#;

    #[test]
    fn unauthorized_renews_once_and_requeries_with_new_credentials() {
        tauri::async_runtime::block_on(async {
            let (url, server) = serve(vec![
                (401, "{}"),
                (200, ROTATED),
                (200, USAGE),
                (200, CREDITS),
            ]);
            let client = reqwest::Client::builder()
                .no_proxy()
                .timeout(std::time::Duration::from_secs(2))
                .build()
                .unwrap();
            let endpoints = Endpoints {
                usage: &format!("{url}/usage"),
                credits: &format!("{url}/credits"),
                token: &format!("{url}/token"),
            };
            let result = query_account_quota(target(), &client, &endpoints).await;
            assert!(result.snapshot.success);
            assert_eq!(result.snapshot.windows[0].remaining_percent, Some(75.0));
            assert_eq!(result.snapshot.reset_credits, Some(1));
            assert_eq!(
                result.refreshed_auth.unwrap()["tokens"]["refresh_token"],
                "next-refresh"
            );
            let requests = server.join().unwrap();
            assert!(
                requests[0].starts_with("get /usage ")
                    && requests[0].contains("authorization: bearer old-access")
            );
            assert!(
                requests[1].starts_with("post /token ")
                    && requests[1].contains("refresh_token=old-refresh")
            );
            assert!(
                requests[2].contains("authorization: bearer next-access")
                    && requests[2].contains("chatgpt-account-id: workspace")
            );
            let ipc = serde_json::to_string(&result.snapshot).unwrap();
            assert!(!ipc.contains("next-access") && !ipc.contains("next-refresh"));
        });
    }

    #[test]
    fn forbidden_is_not_refreshed_and_invalid_refresh_body_is_never_exposed() {
        tauri::async_runtime::block_on(async {
            for script in [
                vec![(403, "private-response-secret")],
                vec![(401, "{}"), (400, "private-response-secret")],
            ] {
                let (url, server) = serve(script);
                let client = reqwest::Client::builder().no_proxy().build().unwrap();
                let endpoints = Endpoints {
                    usage: &url,
                    credits: &url,
                    token: &url,
                };
                let result = query_account_quota(target(), &client, &endpoints).await;
                assert!(!result.snapshot.success && result.refreshed_auth.is_none());
                let error = result.snapshot.error.unwrap();
                assert!(
                    !error.contains("private-response-secret") && !error.contains("old-refresh")
                );
                server.join().unwrap();
            }
        });
    }

    #[test]
    fn rotated_tokens_survive_failed_requery_and_auxiliary_failure_preserves_quota() {
        tauri::async_runtime::block_on(async {
            for (script, success, renewed) in [
                (vec![(401, "{}"), (200, ROTATED), (401, "{}")], false, true),
                (vec![(200, USAGE), (403, "{}")], true, false),
                (vec![(503, "{}"), (200, USAGE), (200, CREDITS)], true, false),
            ] {
                let (url, server) = serve(script);
                let client = reqwest::Client::builder().no_proxy().build().unwrap();
                let endpoints = Endpoints {
                    usage: &url,
                    credits: &url,
                    token: &url,
                };
                let result = query_account_quota(target(), &client, &endpoints).await;
                assert_eq!(result.snapshot.success, success);
                assert_eq!(result.refreshed_auth.is_some(), renewed);
                if success && result.snapshot.reset_credits.is_none() {
                    assert!(result.snapshot.reset_credits_error.is_some());
                }
                server.join().unwrap();
            }
        });
    }

    #[test]
    fn reset_expiry_preserves_timezone_and_unix_second_boundaries() {
        let utc = parse_rfc3339_seconds("2026-10-25T00:00:00Z").unwrap();
        assert_eq!(
            parse_rfc3339_seconds("2026-10-25T08:00:00+08:00"),
            Some(utc)
        );
        assert_eq!(parse_rfc3339_seconds("1969-12-31T23:59:59.5Z"), Some(-1));
        for invalid in ["", "2026-10-25", "2026-02-30T00:00:00Z", "invalid"] {
            assert_eq!(parse_rfc3339_seconds(invalid), None);
        }
    }

    #[test]
    fn missing_or_invalid_windows_never_become_full_quota() {
        for used in [None, Some(-1.0), Some(101.0), Some(f64::NAN)] {
            let result = normalize_compatibility_window(CompatibilityWindow {
                used_percent: used,
                limit_window_seconds: Some(300),
                window_duration_mins: None,
                reset_at: None,
            });
            assert!(result.is_none());
        }
        let full = normalize_compatibility_window(CompatibilityWindow {
            used_percent: Some(0.0),
            limit_window_seconds: Some(18_000),
            window_duration_mins: None,
            reset_at: Some(123),
        })
        .unwrap();
        assert_eq!(full.remaining_percent, Some(100.0));
        assert_eq!(full.duration_minutes, Some(300));
    }
}
