//! ChatGPT OAuth 兼容层：端点和响应格式集中于此，不宣称为稳定公开 API。
use crate::{account_store, http_client};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use reqwest::{Client, StatusCode};
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

const CLIENT_ID: &str = "app_EMoamEEZ73f0CkXaXp7hrann";
const AUTHORIZE_URL: &str = "https://auth.openai.com/oauth/authorize";
pub(crate) const TOKEN_URL: &str = "https://auth.openai.com/oauth/token";
const DEVICE_CODE_URL: &str = "https://auth.openai.com/api/accounts/deviceauth/usercode";
const DEVICE_POLL_URL: &str = "https://auth.openai.com/api/accounts/deviceauth/token";
pub const DEVICE_VERIFICATION_URL: &str = "https://auth.openai.com/codex/device";
const DEVICE_REDIRECT_URI: &str = "https://auth.openai.com/deviceauth/callback";
pub const BROWSER_CALLBACK_PORT: u16 = 1455;
pub const BROWSER_CALLBACK_PATH: &str = "/auth/callback";
const BROWSER_REDIRECT_URI: &str = "http://localhost:1455/auth/callback";

#[derive(Deserialize)]
pub(crate) struct TokenResponse {
    access_token: String,
    id_token: Option<String>,
    refresh_token: Option<String>,
}

pub struct BrowserAuthorization {
    pub url: String,
    pub state: String,
    verifier: String,
}

fn random_secret() -> Result<String, String> {
    let mut bytes = [0_u8; 32];
    getrandom::fill(&mut bytes).map_err(|_| "无法生成安全授权随机数")?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}

fn challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

impl BrowserAuthorization {
    pub fn new() -> Result<Self, String> {
        let verifier = random_secret()?;
        let state = random_secret()?;
        let mut url = tauri::Url::parse(AUTHORIZE_URL).map_err(|_| "授权端点配置无效")?;
        url.query_pairs_mut().extend_pairs([
            ("response_type", "code"),
            ("client_id", CLIENT_ID),
            ("redirect_uri", BROWSER_REDIRECT_URI),
            ("scope", "openid profile email offline_access"),
            ("code_challenge_method", "S256"),
            ("code_challenge", challenge(&verifier).as_str()),
            ("state", state.as_str()),
        ]);
        Ok(Self {
            url: url.to_string(),
            state,
            verifier,
        })
    }

    pub async fn complete(&self, client: &Client, code: &str) -> Result<Value, String> {
        exchange_code(client, code, &self.verifier, BROWSER_REDIRECT_URI).await
    }
}

pub struct DeviceAuthorization {
    pub device_auth_id: String,
    pub user_code: String,
    pub interval_secs: u64,
    pub expires_in: u64,
}

#[derive(Deserialize)]
struct DeviceResponse {
    device_auth_id: String,
    user_code: String,
    interval: Option<Value>,
    expires_in: Option<u64>,
}

pub async fn start_device(client: &Client) -> Result<DeviceAuthorization, String> {
    let response = client
        .post(DEVICE_CODE_URL)
        .json(&json!({"client_id": CLIENT_ID}))
        .send()
        .await
        .map_err(|error| http_client::network_error("设备授权", &error))?;
    if !response.status().is_success() {
        return Err(format!("申请设备码失败（HTTP {}）", response.status()));
    }
    let code: DeviceResponse = response
        .json()
        .await
        .map_err(|_| "设备授权返回了无法识别的响应")?;
    if code.device_auth_id.trim().is_empty() || code.user_code.trim().is_empty() {
        return Err("设备授权返回的验证码不完整".into());
    }
    let interval = code
        .interval
        .as_ref()
        .and_then(|value| value.as_u64().or_else(|| value.as_str()?.parse().ok()))
        .unwrap_or(5);
    Ok(DeviceAuthorization {
        device_auth_id: code.device_auth_id,
        user_code: code.user_code,
        interval_secs: interval.clamp(1, 30) + 3,
        expires_in: code.expires_in.unwrap_or(900).clamp(1, 900),
    })
}

pub async fn poll_device(
    client: &Client,
    device: &DeviceAuthorization,
) -> Result<Option<Value>, String> {
    let response = client
        .post(DEVICE_POLL_URL)
        .json(&json!({"device_auth_id": device.device_auth_id, "user_code": device.user_code}))
        .send()
        .await
        .map_err(|error| http_client::network_error("设备授权", &error))?;
    if matches!(
        response.status(),
        StatusCode::FORBIDDEN | StatusCode::NOT_FOUND | StatusCode::TOO_MANY_REQUESTS
    ) {
        return Ok(None);
    }
    if response.status() == StatusCode::GONE {
        return Err("设备码已过期，请重新发起登录".into());
    }
    if !response.status().is_success() {
        return Err(format!("检查设备授权失败（HTTP {}）", response.status()));
    }
    #[derive(Deserialize)]
    struct Authorized {
        authorization_code: String,
        code_verifier: String,
    }
    let authorized: Authorized = response
        .json()
        .await
        .map_err(|_| "设备授权返回了无法识别的响应")?;
    if authorized.authorization_code.is_empty() || authorized.code_verifier.is_empty() {
        return Err("设备授权信息不完整".into());
    }
    exchange_code(
        client,
        &authorized.authorization_code,
        &authorized.code_verifier,
        DEVICE_REDIRECT_URI,
    )
    .await
    .map(Some)
}

async fn exchange_code(
    client: &Client,
    code: &str,
    verifier: &str,
    redirect_uri: &str,
) -> Result<Value, String> {
    let response = client
        .post(TOKEN_URL)
        .form(&[
            ("grant_type", "authorization_code"),
            ("client_id", CLIENT_ID),
            ("code", code),
            ("code_verifier", verifier),
            ("redirect_uri", redirect_uri),
        ])
        .send()
        .await
        .map_err(|error| http_client::network_error("交换登录凭据", &error))?;
    let tokens = parse_tokens(response, "交换登录凭据").await?;
    materialize_tokens(tokens)
}

async fn parse_tokens(response: reqwest::Response, action: &str) -> Result<TokenResponse, String> {
    if !response.status().is_success() {
        return Err(format!(
            "{action}失败（HTTP {}），请重新登录",
            response.status()
        ));
    }
    let tokens: TokenResponse = response
        .json()
        .await
        .map_err(|_| format!("{action}返回了无法识别的响应"))?;
    if tokens.access_token.trim().is_empty() {
        return Err(format!("{action}返回的访问凭据为空"));
    }
    Ok(tokens)
}

fn refreshed_at() -> Result<String, String> {
    time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .map_err(|_| "无法记录凭据刷新时间".into())
}

pub(crate) fn materialize_tokens(tokens: TokenResponse) -> Result<Value, String> {
    let auth = json!({ "auth_mode": "chatgpt", "OPENAI_API_KEY": null, "tokens": { "access_token": tokens.access_token, "id_token": tokens.id_token, "refresh_token": tokens.refresh_token }, "last_refresh": refreshed_at()? });
    account_store::normalized_auth(&auth)
}

pub(crate) async fn refresh_auth_at(
    client: &Client,
    auth: &Value,
    token_url: &str,
) -> Result<Value, String> {
    let refresh = auth
        .pointer("/tokens/refresh_token")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or("缺少刷新凭据，请重新登录")?;
    // 刷新请求不自动重放，避免服务端已经轮换 refresh_token 后再次提交旧值。
    let response = client
        .post(token_url)
        .form(&[
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh),
            ("client_id", CLIENT_ID),
        ])
        .send()
        .await
        .map_err(|error| http_client::network_error("刷新登录凭据", &error))?;
    let refreshed = parse_tokens(response, "刷新登录凭据").await?;
    merge_tokens(auth, refreshed)
}

fn merge_tokens(auth: &Value, refreshed: TokenResponse) -> Result<Value, String> {
    let mut next = auth.clone();
    let tokens = next
        .get_mut("tokens")
        .and_then(Value::as_object_mut)
        .ok_or("登录凭据格式无效")?;
    tokens.insert("access_token".into(), refreshed.access_token.into());
    if let Some(value) = refreshed
        .refresh_token
        .filter(|value| !value.trim().is_empty())
    {
        tokens.insert("refresh_token".into(), value.into());
    }
    if let Some(value) = refreshed.id_token.filter(|value| !value.trim().is_empty()) {
        tokens.insert("id_token".into(), value.into());
    }
    next["last_refresh"] = refreshed_at()?.into();
    let next = account_store::normalized_auth(&next)?;
    account_store::validate_same_identity(auth, &next)?;
    Ok(next)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_uses_standard_sha256_challenge_and_fresh_secrets() {
        assert_eq!(
            challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
        let first = BrowserAuthorization::new().unwrap();
        let next = BrowserAuthorization::new().unwrap();
        assert_ne!(first.state, next.state);
        assert_ne!(first.verifier, next.verifier);
        let url = tauri::Url::parse(&first.url).unwrap();
        assert_eq!(url.host_str(), Some("auth.openai.com"));
        assert!(url
            .query_pairs()
            .any(|(key, value)| key == "code_challenge_method" && value == "S256"));
    }

    #[test]
    fn refresh_preserves_missing_tokens_and_rejects_identity_changes() {
        let auth = json!({"auth_mode":"chatgpt", "tokens":{"account_id":"account", "access_token":"old-access", "refresh_token":"old-refresh"}});
        let next = merge_tokens(
            &auth,
            TokenResponse {
                access_token: "next-access".into(),
                id_token: None,
                refresh_token: None,
            },
        )
        .unwrap();
        assert_eq!(next["tokens"]["refresh_token"], "old-refresh");
        assert_eq!(next["tokens"]["access_token"], "next-access");
        let wrong = URL_SAFE_NO_PAD
            .encode(br#"{"https://api.openai.com/auth":{"chatgpt_account_id":"different"}}"#);
        assert!(merge_tokens(
            &auth,
            TokenResponse {
                access_token: format!("test.{wrong}.test"),
                id_token: None,
                refresh_token: Some("new-refresh".into())
            }
        )
        .is_err());
        let mut with_subject = auth.clone();
        with_subject["tokens"]["id_token"] = format!(
            "test.{}.test",
            URL_SAFE_NO_PAD.encode(br#"{"sub":"original-user"}"#)
        )
        .into();
        let other_subject = URL_SAFE_NO_PAD.encode(br#"{"sub":"other-user"}"#);
        assert!(merge_tokens(
            &with_subject,
            TokenResponse {
                access_token: format!("test.{other_subject}.test"),
                id_token: None,
                refresh_token: None
            }
        )
        .is_err());
    }
}
