use crate::app_server::AppServerState;
use serde::Serialize;
use serde_json::{json, Value};

/// 切换账户或服务重启后元数据可能返回较慢，最多等待 40 秒。
const ACCOUNT_REQUEST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(40);

/// 当前账户标识仅供额度提醒按邮箱去重，不透传认证凭据。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountProfile {
    email: Option<String>,
}

/// 通过已建立的本机 app-server 读取当前账户，不读取 auth.json，也不主动刷新令牌。
pub async fn read_account(state: &AppServerState) -> Result<AccountProfile, String> {
    let result = state
        .request_with_timeout(
            "account/read",
            json!({ "refreshToken": false }),
            ACCOUNT_REQUEST_TIMEOUT,
        )
        .await?;
    let account = result.get("account").filter(|value| !value.is_null());
    Ok(AccountProfile {
        email: account
            .and_then(|value| value.get("email"))
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_owned),
    })
}
