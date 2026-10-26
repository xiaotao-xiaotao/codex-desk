//! 应用直接处理 OAuth：浏览器 PKCE 回调与设备码轮询均不启动 CLI。
use crate::{account_store, http_client::HttpState, oauth};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{sync::Arc, time::Duration};
use tauri::Manager;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    sync::{watch, Mutex},
    time::{sleep, timeout},
};

const LOGIN_TIMEOUT: Duration = Duration::from_secs(900);
const OAUTH_REQUEST_TIMEOUT: Duration = Duration::from_secs(45);
const CALLBACK_READ_TIMEOUT: Duration = Duration::from_secs(5);
const MAX_CALLBACK_BYTES: usize = 8192;

#[derive(Clone, Copy, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LoginMethod {
    #[default]
    Browser,
    Device,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginStatus {
    session_id: String,
    phase: String,
    error: Option<String>,
    method: LoginMethod,
    #[serde(skip_serializing_if = "Option::is_none")]
    user_code: Option<String>,
}

struct Session {
    status: LoginStatus,
    url: Option<String>,
    cancel: watch::Sender<bool>,
    done: watch::Receiver<bool>,
}

#[derive(Clone, Default)]
pub struct AccountLoginState(Arc<Mutex<Option<Session>>>);

impl AccountLoginState {
    pub async fn shutdown(&self) {
        let id = self
            .0
            .lock()
            .await
            .as_ref()
            .map(|s| s.status.session_id.clone());
        if let Some(id) = id {
            let _ = self.cancel(&id).await;
        }
    }

    pub async fn start(
        &self,
        app: tauri::AppHandle,
        label: String,
        method: LoginMethod,
    ) -> Result<LoginStatus, String> {
        let label = if label.trim().is_empty() {
            String::new()
        } else {
            account_store::checked_label(&label)?
        };
        let client = app.state::<HttpState>().client(OAUTH_REQUEST_TIMEOUT)?;
        let store = account_store::AccountStore::from_app(&app)?;
        let mut current = self.0.lock().await;
        if current.as_ref().is_some_and(|s| !*s.done.borrow()) {
            return Err("请先完成或取消正在进行的登录".into());
        }
        let mut bytes = [0_u8; 16];
        getrandom::fill(&mut bytes).map_err(|_| "无法生成登录会话标识")?;
        let id = bytes
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
        let (cancel, mut cancelled) = watch::channel(false);
        let (done, finished) = watch::channel(false);
        let status = LoginStatus {
            session_id: id.clone(),
            phase: "preparing".into(),
            error: None,
            method,
            user_code: None,
        };
        *current = Some(Session {
            status: status.clone(),
            url: None,
            cancel,
            done: finished,
        });
        let state = self.clone();
        tauri::async_runtime::spawn(async move {
            let authorize = async {
                match method {
                    LoginMethod::Browser => {
                        let listener = TcpListener::bind((
                            std::net::Ipv4Addr::LOCALHOST,
                            oauth::BROWSER_CALLBACK_PORT,
                        ))
                        .await
                        .map_err(|_| {
                            "浏览器授权回调端口被占用，请关闭其他登录窗口或使用设备码登录"
                        })?;
                        let authorization = oauth::BrowserAuthorization::new()?;
                        state.waiting(&id, authorization.url.clone(), None).await?;
                        loop {
                            let (mut stream, peer) = listener
                                .accept()
                                .await
                                .map_err(|_| "无法接收浏览器授权回调")?;
                            if !peer.ip().is_loopback() {
                                continue;
                            }
                            let result = timeout(
                                CALLBACK_READ_TIMEOUT,
                                read_callback(&mut stream, &authorization.state),
                            )
                            .await;
                            match result {
                                Ok(Ok(Some(code))) => {
                                    let _ = callback_response(&mut stream, true).await;
                                    break authorization.complete(&client, &code).await;
                                }
                                Ok(Err(error)) => {
                                    let _ = callback_response(&mut stream, false).await;
                                    break Err(error);
                                }
                                _ => {
                                    let _ = callback_response(&mut stream, false).await;
                                }
                            }
                        }
                    }
                    LoginMethod::Device => {
                        let device = oauth::start_device(&client).await?;
                        state
                            .waiting(
                                &id,
                                oauth::DEVICE_VERIFICATION_URL.into(),
                                Some(device.user_code.clone()),
                            )
                            .await?;
                        timeout(Duration::from_secs(device.expires_in), async {
                            loop {
                                sleep(Duration::from_secs(device.interval_secs)).await;
                                if let Some(auth) = oauth::poll_device(&client, &device).await? {
                                    return Ok(auth);
                                }
                            }
                        })
                        .await
                        .unwrap_or_else(|_| Err("设备码已过期，请重新发起登录".into()))
                    }
                }
            };
            let result: Result<Value, String> = tokio::select! {
                result = timeout(LOGIN_TIMEOUT, authorize) => result.unwrap_or_else(|_| Err("登录超时，请重新发起".into())),
                _ = cancelled.changed() => Err("登录已取消".into()),
            };
            let result = match result {
                Ok(auth) => {
                    let gate = app.state::<account_store::AccountStoreState>();
                    let _gate = gate.0.lock().await;
                    let mut session = state.0.lock().await;
                    if session
                        .as_ref()
                        .is_none_or(|s| s.status.session_id != id || *s.cancel.borrow())
                    {
                        Err("登录已取消".into())
                    } else {
                        let session = session.as_mut().unwrap();
                        session.status.phase = "saving".into();
                        session.url = None;
                        session.status.user_code = None;
                        // 保存和取消以会话锁串行提交，取消返回后不能再保存本次授权。
                        store.save_login(&auth, &label)
                    }
                }
                Err(error) => Err(error),
            };
            let mut session = state.0.lock().await;
            if let Some(session) = session.as_mut().filter(|s| s.status.session_id == id) {
                session.url = None;
                session.status.user_code = None;
                session.status.phase = if result.is_ok() {
                    "completed"
                } else if *session.cancel.borrow() {
                    "cancelled"
                } else {
                    "failed"
                }
                .into();
                session.status.error = result.err();
            }
            let _ = done.send(true);
        });
        Ok(status)
    }

    async fn waiting(&self, id: &str, url: String, code: Option<String>) -> Result<(), String> {
        if !valid_auth_url(&url) {
            return Err("授权地址无效".into());
        }
        let mut current = self.0.lock().await;
        let session = current
            .as_mut()
            .filter(|s| s.status.session_id == id && !*s.cancel.borrow())
            .ok_or("登录已取消")?;
        session.url = Some(url.clone());
        session.status.user_code = code;
        session.status.phase = "waiting".into();
        if crate::open_external_url(&url, "账户授权页面").is_err() {
            session.status.error = Some("未能打开浏览器，请点击重新打开授权页面".into());
        }
        Ok(())
    }

    pub async fn status(&self, id: &str) -> Result<LoginStatus, String> {
        self.0
            .lock()
            .await
            .as_ref()
            .filter(|s| s.status.session_id == id)
            .map(|s| s.status.clone())
            .ok_or_else(|| "登录会话已结束".into())
    }

    pub async fn reopen(&self, id: &str) -> Result<(), String> {
        let mut current = self.0.lock().await;
        let session = current
            .as_mut()
            .filter(|s| s.status.session_id == id && !*s.cancel.borrow())
            .ok_or("登录会话已结束")?;
        let url = session
            .url
            .as_deref()
            .ok_or("授权页面尚未准备好或登录已结束")?;
        if !valid_auth_url(url) {
            return Err("授权地址无效".into());
        }
        crate::open_external_url(url, "账户授权页面")?;
        session.status.error = None;
        Ok(())
    }

    pub async fn cancel(&self, id: &str) -> Result<(), String> {
        let mut done = {
            let current = self.0.lock().await;
            let session = current
                .as_ref()
                .filter(|s| s.status.session_id == id)
                .ok_or("登录会话已结束")?;
            let _ = session.cancel.send(true);
            session.done.clone()
        };
        if !*done.borrow() {
            let _ = done.changed().await;
        }
        Ok(())
    }
}

fn valid_auth_url(raw: &str) -> bool {
    tauri::Url::parse(raw).is_ok_and(|url| {
        url.scheme() == "https"
            && url.host_str() == Some("auth.openai.com")
            && url.username().is_empty()
            && url.password().is_none()
            && url.port().is_none()
            && matches!(url.path(), "/oauth/authorize" | "/codex/device")
    })
}

/// 回调 state 必须唯一且一致；拒绝额外来源、重复参数和不完整授权，且不回显敏感内容。
fn callback_code(target: &str, expected_state: &str) -> Result<Option<String>, String> {
    if !target.starts_with('/') || target.starts_with("//") {
        return Ok(None);
    }
    let Ok(url) = tauri::Url::parse(&format!(
        "http://localhost:{}{target}",
        oauth::BROWSER_CALLBACK_PORT
    )) else {
        return Ok(None);
    };
    if url.path() != oauth::BROWSER_CALLBACK_PATH {
        return Ok(None);
    }
    let pairs = url.query_pairs().collect::<Vec<_>>();
    let states = pairs
        .iter()
        .filter(|(key, _)| key == "state")
        .collect::<Vec<_>>();
    if states.len() != 1 || states[0].1 != expected_state {
        return Ok(None);
    }
    if pairs.iter().any(|(key, _)| key == "error") {
        return Err("浏览器授权未完成，请重新登录".into());
    }
    let codes = pairs
        .iter()
        .filter(|(key, _)| key == "code")
        .collect::<Vec<_>>();
    if codes.len() != 1 || codes[0].1.trim().is_empty() {
        return Ok(None);
    }
    Ok(Some(codes[0].1.to_string()))
}

async fn read_callback(stream: &mut TcpStream, state: &str) -> Result<Option<String>, String> {
    let mut bytes = Vec::new();
    let mut chunk = [0_u8; 512];
    while bytes.len() < MAX_CALLBACK_BYTES {
        let read = stream
            .read(&mut chunk)
            .await
            .map_err(|_| "无法读取授权回调")?;
        if read == 0 {
            break;
        }
        bytes.extend_from_slice(&chunk[..read]);
        if bytes.windows(4).any(|value| value == b"\r\n\r\n") {
            break;
        }
    }
    if bytes.len() >= MAX_CALLBACK_BYTES {
        return Ok(None);
    }
    let Ok(request) = std::str::from_utf8(&bytes) else {
        return Ok(None);
    };
    let parts = request
        .lines()
        .next()
        .unwrap_or_default()
        .split_whitespace()
        .collect::<Vec<_>>();
    if parts.len() != 3 || parts[0] != "GET" {
        return Ok(None);
    }
    callback_code(parts[1], state)
}

async fn callback_response(stream: &mut TcpStream, accepted: bool) -> Result<(), std::io::Error> {
    let (status, body) = if accepted {
        ("200 OK", "已收到授权，请返回 Codex Desk 查看登录结果。")
    } else {
        ("400 Bad Request", "授权回调无效，请返回应用重新登录。")
    };
    let response = format!("HTTP/1.1 {status}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n{body}", body.len());
    stream.write_all(response.as_bytes()).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn browser_callback_accepts_fragmented_http_and_replies_with_crlf() {
        tauri::async_runtime::block_on(async {
            let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))
                .await
                .unwrap();
            let mut browser = TcpStream::connect(listener.local_addr().unwrap())
                .await
                .unwrap();
            let (mut callback, _) = listener.accept().await.unwrap();
            let server = async {
                let code = read_callback(&mut callback, "expected").await.unwrap();
                assert_eq!(code.as_deref(), Some("test-code"));
                callback_response(&mut callback, true).await.unwrap();
            };
            let client = async {
                browser
                    .write_all(b"GET /auth/callback?state=expected&code=test-code HTTP/1.1\r\n")
                    .await
                    .unwrap();
                tokio::task::yield_now().await;
                browser.write_all(b"Host: localhost\r\n\r\n").await.unwrap();
                let mut response = [0; 1024];
                let read = browser.read(&mut response).await.unwrap();
                assert!(response[..read]
                    .windows(4)
                    .any(|bytes| bytes == b"\r\n\r\n"));
                assert!(!String::from_utf8_lossy(&response[..read]).contains("test-code"));
            };
            timeout(Duration::from_secs(2), async {
                tokio::join!(server, client);
            })
            .await
            .unwrap();
        });
    }

    #[test]
    fn callback_requires_state_unique_code_and_expected_path() {
        assert_eq!(
            callback_code("/auth/callback?state=expected&code=sample", "expected").unwrap(),
            Some("sample".into())
        );
        for target in [
            "/auth/callback?state=wrong&code=sample",
            "/auth/callback?code=sample",
            "/auth/callback?state=expected&state=expected&code=sample",
            "/auth/callback?state=expected&code=a&code=b",
            "/other?state=expected&code=sample",
            "//example.invalid/auth/callback?state=expected&code=sample",
        ] {
            assert!(callback_code(target, "expected").unwrap().is_none());
        }
        assert!(callback_code("/auth/callback?state=expected&error=denied", "expected").is_err());
    }

    #[test]
    fn only_trusted_auth_pages_can_be_opened() {
        assert!(valid_auth_url(
            "https://auth.openai.com/oauth/authorize?state=sample"
        ));
        assert!(valid_auth_url(oauth::DEVICE_VERIFICATION_URL));
        for url in [
            "http://auth.openai.com/oauth/authorize",
            "https://auth.openai.com.evil.invalid/oauth/authorize",
            "https://user@auth.openai.com/oauth/authorize",
            "https://auth.openai.com:8443/codex/device",
        ] {
            assert!(!valid_auth_url(url));
        }
    }
}
