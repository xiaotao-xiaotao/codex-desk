use crate::app_server::AppServerState;
use serde::Serialize;
use serde_json::{json, Value};

/// 仅包含个人中心需要展示的账户元数据，不透传任何认证凭据。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountProfile {
    email: Option<String>,
    plan_type: Option<String>,
    account_type: Option<String>,
    requires_openai_auth: bool,
}

/// 通过已建立的本机 app-server 读取当前账户，不读取 auth.json，也不主动刷新令牌。
pub async fn read_account(state: &AppServerState) -> Result<AccountProfile, String> {
    let result = state
        .request("account/read", json!({ "refreshToken": false }))
        .await?;
    let account = result.get("account").filter(|value| !value.is_null());
    let field = |name| {
        account
            .and_then(|value| value.get(name))
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_owned)
    };
    Ok(AccountProfile {
        email: field("email"),
        plan_type: field("planType"),
        account_type: field("type"),
        requires_openai_auth: result
            .get("requiresOpenaiAuth")
            .and_then(Value::as_bool)
            .unwrap_or(false),
    })
}
