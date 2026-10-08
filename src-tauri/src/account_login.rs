//! 独立授权会话：IPC 只提供阶段和供用户输入的设备码，认证 URL 与令牌留在后端。
use crate::{account_store, app_server};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{sync::Arc, time::Duration};
use tauri::Manager;
use tokio::{
    io::{AsyncBufRead, AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    sync::{watch, Mutex},
    time::timeout,
};

const LOGIN_TIMEOUT: Duration = Duration::from_secs(600);
const RPC_TIMEOUT: Duration = Duration::from_secs(30);
const MAX_MESSAGE_BYTES: u64 = 1024 * 1024;

#[derive(Clone, Copy, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LoginMethod {
    #[default]
    Browser,
    Device,
}

impl LoginMethod {
    fn rpc_type(self) -> &'static str {
        match self {
            Self::Browser => "chatgpt",
            Self::Device => "chatgptDeviceCode",
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginStatus {
    session_id: String,
    phase: String,
    error: Option<String>,
    method: LoginMethod,
    // 仅公开需要用户手动输入的验证码，不包含后端设备配对凭据。
    #[serde(skip_serializing_if = "Option::is_none")]
    user_code: Option<String>,
}

struct Session {
    status: LoginStatus,
    // 授权地址包含临时配对信息，不进入前端或日志。
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
        let mut current = self.0.lock().await;
        if current.as_ref().is_some_and(|s| !*s.done.borrow()) {
            return Err("请先完成或取消正在进行的登录".into());
        }
        let store = account_store::AccountStore::from_app(&app)?;
        let home = tempfile::Builder::new()
            .prefix("codex-desk-login-")
            .tempdir()
            .map_err(|_| "无法创建临时登录目录")?;
        let id = home
            .path()
            .file_name()
            .ok_or("无法标识登录会话")?
            .to_string_lossy()
            .into_owned();
        let child = app
            .state::<app_server::AppServerState>()
            .login_process(home.path())
            .await?;
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
            let mut child = child;
            let authorization = async {
                let mut stdin = child.stdin.take().ok_or("无法建立登录输入通道")?;
                let mut reader = BufReader::new(child.stdout.take().ok_or("无法建立登录输出通道")?);
                send(
                    &mut stdin,
                    json!({"id":1,"method":"initialize","params":{
                        "clientInfo":{"name":"codex-desk","version":env!("CODEX_DESK_VERSION")}
                    }}),
                )
                .await?;
                response(&mut reader, 1).await?;
                send(&mut stdin, json!({"method":"initialized"})).await?;
                send(
                    &mut stdin,
                    json!({"id":2,"method":"account/login/start","params":{"type":method.rpc_type()}}),
                )
                .await?;
                let login = response(&mut reader, 2).await?;
                let (login_id, url, user_code) = login_prompt(&login, method)?;
                {
                    let mut session = state.0.lock().await;
                    let session = session.as_mut().ok_or("登录会话已结束")?;
                    session.url = Some(url.clone());
                    session.status.user_code = user_code;
                    session.status.phase = "waiting".into();
                }
                // 浏览器打开失败可在界面重试；授权等待仍继续。
                if crate::open_external_url(&url, "账户授权页面").is_err() {
                    if let Some(session) = state.0.lock().await.as_mut() {
                        session.status.error =
                            Some("未能打开浏览器，请点击重新打开授权页面".into());
                    }
                }
                wait_for_login(&mut reader, &login_id).await
            };
            let result = tokio::select! {
                result = timeout(LOGIN_TIMEOUT, authorization) => result.unwrap_or_else(|_| Err("登录超过 10 分钟，请重新发起".into())),
                _ = cancelled.changed() => Err("登录已取消".into()),
            };
            if result.is_ok() {
                if let Some(session) = state.0.lock().await.as_mut() {
                    session.url = None;
                    session.status.user_code = None;
                    session.status.phase = "saving".into();
                }
            }
            // 关闭会话所属进程树再读取最终文件，防止写入与目录清理发生竞争。
            app_server::close_proxy(child).await;
            let result = match result {
                Ok(()) => {
                    let gate = app.state::<account_store::AccountStoreState>();
                    let _gate = gate.0.lock().await;
                    let session = state.0.lock().await;
                    if session.as_ref().is_none_or(|s| *s.cancel.borrow()) {
                        Err("登录已取消".into())
                    } else {
                        // 提交与取消在会话锁上串行；取消返回后不会再保存此会话。
                        read_auth(&home.path().join("auth.json"))
                            .and_then(|auth| store.save_login(&auth, &label))
                    }
                }
                Err(error) => Err(error),
            };
            let cleaned = home.close().is_ok();
            let mut session = state.0.lock().await;
            if let Some(session) = session.as_mut() {
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
                if !cleaned {
                    session.status.error = Some("临时登录目录未能清理，请检查系统文件权限".into());
                }
            }
            let _ = done.send(true);
        });
        Ok(status)
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
        let url = current
            .as_ref()
            .filter(|s| s.status.session_id == id)
            .and_then(|s| s.url.as_deref())
            .ok_or("授权页面尚未准备好或登录已结束")?;
        crate::open_external_url(url, "账户授权页面")?;
        if let Some(session) = current.as_mut() {
            session.status.error = None;
        }
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
    valid_login_url(raw, LoginMethod::Browser)
}

fn valid_login_url(raw: &str, method: LoginMethod) -> bool {
    tauri::Url::parse(raw).is_ok_and(|url| {
        url.scheme() == "https"
            && url.host_str() == Some("auth.openai.com")
            && url.username().is_empty()
            && url.password().is_none()
            && url.port().is_none()
            && url.path()
                == match method {
                    LoginMethod::Browser => "/oauth/authorize",
                    LoginMethod::Device => "/codex/device",
                }
    })
}

/// 两种登录共用 CLI 协议，严格区分返回类型和授权地址，避免打开任意链接。
fn login_prompt(
    login: &Value,
    method: LoginMethod,
) -> Result<(String, String, Option<String>), String> {
    if login["type"].as_str() != Some(method.rpc_type()) {
        return Err("本机 Codex 不支持所选登录方式，请更新 CLI 或选择另一种方式".into());
    }
    let id = login["loginId"]
        .as_str()
        .filter(|id| !id.is_empty() && id.len() < 256)
        .ok_or("Codex 未返回有效登录标识，请更新 CLI 后重试")?;
    let url_field = if method == LoginMethod::Device {
        "verificationUrl"
    } else {
        "authUrl"
    };
    let url = login[url_field]
        .as_str()
        .filter(|url| match method {
            LoginMethod::Browser => valid_auth_url(url),
            LoginMethod::Device => valid_login_url(url, method),
        })
        .ok_or("Codex 返回了无法验证的授权地址")?;
    let code = if method == LoginMethod::Device {
        Some(
            login["userCode"]
                .as_str()
                .filter(|code| {
                    !code.is_empty()
                        && code.len() <= 64
                        && code.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-')
                })
                .ok_or("Codex 未返回有效设备码，请重新发起登录")?
                .to_owned(),
        )
    } else {
        None
    };
    Ok((id.into(), url.into(), code))
}

async fn wait_for_login(
    reader: &mut (impl AsyncBufRead + Unpin),
    login_id: &str,
) -> Result<(), String> {
    loop {
        let message = read_message(reader).await?;
        if message["method"].as_str() != Some("account/login/completed")
            || message["params"]["loginId"].as_str() != Some(login_id)
        {
            continue;
        }
        return if message["params"]["success"].as_bool() == Some(true) {
            Ok(())
        } else {
            Err("授权未成功，请检查授权页面和设备码有效期后重试".into())
        };
    }
}

async fn send(
    writer: &mut (impl tokio::io::AsyncWrite + Unpin),
    message: Value,
) -> Result<(), String> {
    writer
        .write_all(format!("{message}\n").as_bytes())
        .await
        .map_err(|_| "无法发送登录请求".to_owned())
        .map(|_| ())
}

async fn read_message(reader: &mut (impl AsyncBufRead + Unpin)) -> Result<Value, String> {
    let mut bytes = Vec::new();
    // 限制单条消息大小，不透传可能包含凭据的进程输出或 RPC 错误。
    reader
        .take(MAX_MESSAGE_BYTES + 1)
        .read_until(b'\n', &mut bytes)
        .await
        .map_err(|_| "登录连接已中断")?;
    if bytes.len() as u64 > MAX_MESSAGE_BYTES || bytes.is_empty() {
        return Err("登录响应无效".into());
    }
    serde_json::from_slice(&bytes).map_err(|_| "登录响应格式无效".into())
}

async fn response(reader: &mut (impl AsyncBufRead + Unpin), id: u64) -> Result<Value, String> {
    timeout(RPC_TIMEOUT, async {
        loop {
            let message = read_message(reader).await?;
            if message["id"].as_u64() != Some(id) {
                continue;
            }
            return message
                .get("result")
                .cloned()
                .ok_or_else(|| "无法启动授权，请检查 CLI 版本、网络及本地回调端口后重试".into());
        }
    })
    .await
    .map_err(|_| "登录准备超时，请检查网络和 Codex CLI")?
}

fn read_auth(path: &std::path::Path) -> Result<Value, String> {
    let metadata = std::fs::symlink_metadata(path).map_err(|_| "未找到登录凭据，请重新授权")?;
    if !metadata.file_type().is_file() || metadata.len() > MAX_MESSAGE_BYTES {
        return Err("登录凭据文件无效".into());
    }
    let bytes = std::fs::read(path).map_err(|_| "无法读取登录凭据")?;
    serde_json::from_slice(&bytes).map_err(|_| "登录凭据格式无效".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn device_prompt_accepts_only_the_expected_code_and_verification_endpoint() {
        let mut prompt = json!({"type":"chatgptDeviceCode","loginId":"device-login",
            "verificationUrl":"https://auth.openai.com/codex/device","userCode":"ABCD-1234"});
        let (id, url, code) = login_prompt(&prompt, LoginMethod::Device).unwrap();
        assert_eq!(id, "device-login");
        assert_eq!(url, "https://auth.openai.com/codex/device");
        assert_eq!(code.as_deref(), Some("ABCD-1234"));
        assert!(login_prompt(&prompt, LoginMethod::Browser).is_err());
        prompt["verificationUrl"] = "https://auth.openai.com.evil.test/codex/device".into();
        assert!(login_prompt(&prompt, LoginMethod::Device).is_err());
        prompt["verificationUrl"] = "https://auth.openai.com/codex/device".into();
        for code in ["", "bad\ncode", "<script>"] {
            prompt["userCode"] = code.into();
            assert!(login_prompt(&prompt, LoginMethod::Device).is_err());
        }
    }

    #[test]
    fn browser_prompt_does_not_publish_device_codes() {
        let prompt = json!({"type":"chatgpt","loginId":"browser-login",
            "authUrl":"https://auth.openai.com/oauth/authorize?state=test","userCode":"ignored"});
        assert!(login_prompt(&prompt, LoginMethod::Browser)
            .unwrap()
            .2
            .is_none());
        assert!(login_prompt(&prompt, LoginMethod::Device).is_err());
    }

    #[test]
    fn completion_ignores_other_logins_and_sanitizes_rejections() {
        tauri::async_runtime::block_on(async {
            let messages = concat!(
                "{\"method\":\"account/login/completed\",\"params\":{\"loginId\":\"old\",\"success\":false}}\n",
                "{\"method\":\"account/updated\",\"params\":{}}\n",
                "{\"method\":\"account/login/completed\",\"params\":{\"loginId\":\"device\",\"success\":true}}\n");
            wait_for_login(&mut BufReader::new(messages.as_bytes()), "device")
                .await
                .unwrap();
            let failure = b"{\"method\":\"account/login/completed\",\"params\":{\"loginId\":\"device\",\"success\":false,\"error\":\"secret-token\"}}\n";
            assert!(!wait_for_login(&mut BufReader::new(&failure[..]), "device")
                .await
                .unwrap_err()
                .contains("secret-token"));
        });
    }

    #[test]
    fn authorization_url_is_restricted_to_expected_endpoint() {
        assert!(valid_auth_url(
            "https://auth.openai.com/oauth/authorize?state=test"
        ));
        for raw in [
            "https://auth.openai.com.evil.test/oauth/authorize",
            "http://auth.openai.com/oauth/authorize",
            "https://user@auth.openai.com/oauth/authorize",
            "https://auth.openai.com/other",
            "file:///auth.json",
        ] {
            assert!(!valid_auth_url(raw));
        }
    }
    #[test]
    fn stale_session_cannot_cancel_or_open_current_authorization() {
        tauri::async_runtime::block_on(async {
            let state = AccountLoginState::default();
            let (cancel, cancelled) = watch::channel(false);
            let (_done, finished) = watch::channel(false);
            *state.0.lock().await = Some(Session {
                status: LoginStatus {
                    session_id: "new".into(),
                    phase: "waiting".into(),
                    error: None,
                    method: LoginMethod::Browser,
                    user_code: None,
                },
                url: Some("https://auth.openai.com/oauth/authorize?state=secret".into()),
                cancel,
                done: finished,
            });
            assert!(state.cancel("old").await.is_err());
            assert!(state.reopen("old").await.is_err());
            assert!(!*cancelled.borrow());
            let serialized = serde_json::to_string(&state.status("new").await.unwrap()).unwrap();
            assert!(!serialized.contains("secret") && !serialized.contains("auth.openai.com"));
        });
    }

    #[test]
    fn cancel_waits_for_worker_cleanup() {
        tauri::async_runtime::block_on(async {
            let state = AccountLoginState::default();
            let (cancel, mut cancelled) = watch::channel(false);
            let (done, finished) = watch::channel(false);
            *state.0.lock().await = Some(Session {
                status: LoginStatus {
                    session_id: "test".into(),
                    phase: "waiting".into(),
                    error: None,
                    method: LoginMethod::Browser,
                    user_code: None,
                },
                url: None,
                cancel,
                done: finished,
            });
            let worker = tokio::spawn(async move {
                cancelled.changed().await.unwrap();
                assert!(*cancelled.borrow());
                done.send(true).unwrap();
            });
            state.cancel("test").await.unwrap();
            assert!(*state.0.lock().await.as_ref().unwrap().done.borrow());
            worker.await.unwrap();
        });
    }

    #[test]
    fn rpc_errors_do_not_echo_secrets() {
        tauri::async_runtime::block_on(async {
            let mut reader =
                BufReader::new(&b"{\"id\":2,\"error\":{\"message\":\"secret-token\"}}\n"[..]);
            assert!(!response(&mut reader, 2)
                .await
                .unwrap_err()
                .contains("secret-token"));
        });
    }
}
