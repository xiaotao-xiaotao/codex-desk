//! 本机账户库。凭据仅在后端读取和落盘，IPC 只返回展示所需的摘要。
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use toml_edit::{value, DocumentMut};

const STORE_VERSION: u32 = 1;
const STORE_NAME: &str = "saved-accounts.json";
const DATA_DIRECTORY: &str = ".codex-desk";
const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;
const MAX_LABEL_CHARS: usize = 48;

#[derive(Default)]
pub struct AccountStoreState(pub tokio::sync::Mutex<()>);

#[derive(Clone)]
pub struct AccountStore {
    home: PathBuf,
    path: PathBuf,
}

#[derive(Serialize, Deserialize)]
struct SavedAccount {
    id: String,
    label: String,
    identity: Identity,
    // 禁止为含凭据的类型派生 Debug，防止错误诊断意外输出令牌。
    auth: Value,
    updated_at: u64,
}

#[derive(Serialize, Deserialize, PartialEq, Eq)]
struct Identity {
    // 凭据声明的 ChatGPT 账户标识，用于确认目标凭据归属。
    account_id: String,
    // JWT 用户主体；同一账户/工作区标识下的不同用户不能合并保存。
    subject: Option<String>,
    email: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct StoreFile {
    version: u32,
    accounts: Vec<SavedAccount>,
}

impl Default for StoreFile {
    fn default() -> Self {
        Self {
            version: STORE_VERSION,
            accounts: Vec::new(),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountSummary {
    id: String,
    label: String,
    email: Option<String>,
    updated_at: u64,
    // 仅表示磁盘登录信息匹配，不代表运行中的 daemon 已使用该账户。
    selected: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountStoreSnapshot {
    accounts: Vec<AccountSummary>,
    storage_mode: String,
    can_save_current: bool,
    current_email: Option<String>,
    // 仅报告当前已保存账户的令牌是否变化，凭据内容不进入 IPC。
    current_credentials_changed: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SwitchOutcome {
    pub restart: String,
    // 凭据已经提交后，摘要读取失败不能被报告成“切换失败”。
    pub snapshot: Option<AccountStoreSnapshot>,
}

impl AccountStore {
    pub fn from_app(_app: &tauri::AppHandle) -> Result<Self, String> {
        let home = codex_home()?;
        Ok(Self {
            home,
            path: data_directory()?.join(STORE_NAME),
        })
    }

    pub fn snapshot(&self) -> Result<AccountStoreSnapshot, String> {
        let mode = self.storage_mode()?;
        let current_auth = if mode == "file" {
            self.read_current()
                .ok()
                .and_then(|auth| normalized_auth(&auth).ok())
        } else {
            None
        };
        let current = current_auth.as_ref().and_then(|auth| identity(auth).ok());
        let store = self.load()?;
        // 只比较令牌，忽略 last_refresh 等元数据，避免时间变化误报凭据更新。
        let current_credentials_changed = store.accounts.iter().any(|account| {
            current
                .as_ref()
                .is_some_and(|id| same_identity(id, &account.identity))
                && current_auth.as_ref().is_some_and(|auth| {
                    ["id_token", "access_token", "refresh_token"]
                        .iter()
                        .any(|field| {
                            auth.get("tokens").and_then(|tokens| tokens.get(*field))
                                != account
                                    .auth
                                    .get("tokens")
                                    .and_then(|tokens| tokens.get(*field))
                        })
                })
        });
        let mut accounts = store
            .accounts
            .into_iter()
            .map(|a| AccountSummary {
                selected: current
                    .as_ref()
                    .is_some_and(|id| same_identity(id, &a.identity)),
                id: a.id,
                label: a.label,
                email: a.identity.email,
                updated_at: a.updated_at,
            })
            .collect::<Vec<_>>();
        accounts.sort_by(|a, b| {
            b.selected
                .cmp(&a.selected)
                .then_with(|| a.label.cmp(&b.label))
        });
        Ok(AccountStoreSnapshot {
            accounts,
            storage_mode: mode,
            can_save_current: current.is_some(),
            current_email: current.and_then(|id| id.email),
            current_credentials_changed,
        })
    }

    pub fn save_current(&self, label: &str) -> Result<AccountStoreSnapshot, String> {
        self.ensure_file_mode()?;
        let label = checked_label(label)?;
        self.save_login(&self.read_current()?, &label)?;
        self.snapshot()
    }

    /// 独立登录只收录凭据，当前 auth.json 与运行中服务保持原身份。
    pub fn save_login(&self, auth: &Value, label: &str) -> Result<(), String> {
        let auth = normalized_auth(auth)?;
        let id = identity(&auth)?;
        // 授权前无法获知新账户邮箱；在拿到凭据后命名，避免借用当前账户邮箱。
        let label = if label.trim().is_empty() {
            let prefix = id
                .email
                .as_deref()
                .and_then(|email| email.split_once('@'))
                .map(|(prefix, _)| prefix.trim())
                .filter(|prefix| !prefix.is_empty() && !prefix.chars().any(char::is_control));
            // 邮箱前缀可能超过账户名称长度上限；缺少邮箱时仍保存授权结果，之后可重命名。
            prefix
                .unwrap_or("ChatGPT 账户")
                .chars()
                .take(MAX_LABEL_CHARS)
                .collect()
        } else {
            checked_label(label)?
        };
        let mut store = self.load()?;
        if let Some(account) = store
            .accounts
            .iter_mut()
            .find(|a| same_identity(&a.identity, &id))
        {
            account.label = label;
            account.identity = id;
            account.auth = auth;
            account.updated_at = now();
        } else {
            let mut key = format!("{:x}-{}", now(), store.accounts.len());
            while store.accounts.iter().any(|a| a.id == key) {
                key.push('x');
            }
            store.accounts.push(SavedAccount {
                id: key,
                label,
                identity: id,
                auth,
                updated_at: now(),
            });
        }
        self.persist(&store)
    }

    pub fn rename(&self, id: &str, label: &str) -> Result<AccountStoreSnapshot, String> {
        let label = checked_label(label)?;
        let mut store = self.load()?;
        let account = store
            .accounts
            .iter_mut()
            .find(|a| a.id == id)
            .ok_or("账户已被移除，请刷新列表")?;
        account.label = label;
        account.updated_at = now();
        self.persist(&store)?;
        self.snapshot()
    }

    pub fn remove(&self, id: &str) -> Result<AccountStoreSnapshot, String> {
        let mut store = self.load()?;
        let index = store
            .accounts
            .iter()
            .position(|a| a.id == id)
            .ok_or("账户已被移除，请刷新列表")?;
        store.accounts.remove(index);
        // 删除的是 Desk 的保存记录，不注销当前 Codex 登录。
        self.persist(&store)?;
        self.snapshot()
    }

    pub fn validate_target(&self, id: &str) -> Result<(), String> {
        self.ensure_file_mode()?;
        let store = self.load()?;
        let target = store
            .accounts
            .iter()
            .find(|a| a.id == id)
            .ok_or("账户已被移除，请刷新列表")?;
        let actual = identity(&target.auth)?;
        if !same_identity(&actual, &target.identity) {
            return Err("保存的账户信息不一致，请重新保存该账户".into());
        }
        Ok(())
    }

    pub fn activate(&self, id: &str) -> Result<(), String> {
        self.validate_target(id)?;
        let mut store = self.load()?;
        // 重新读取退出/刷新后的最新凭据，保留 Codex 轮换的 refresh_token。
        // 当前登录读失败时停止切换，避免误用或丢失无法识别的认证数据。
        let current_path = self.home.join("auth.json");
        if current_path
            .try_exists()
            .map_err(|_| "无法检查当前登录信息")?
        {
            let auth = self.read_current()?;
            if let Ok(current_id) = identity(&auth) {
                if let Some(current) = store
                    .accounts
                    .iter_mut()
                    .find(|a| same_identity(&a.identity, &current_id))
                {
                    current.auth = normalized_auth(&auth)?;
                    current.updated_at = now();
                }
            } else {
                return Err("当前登录不是可切换的 ChatGPT 账户，请先检查登录方式".into());
            }
        }
        let target = store
            .accounts
            .iter()
            .find(|a| a.id == id)
            .ok_or("账户已被移除，请刷新列表")?;
        let auth = normalized_auth(&target.auth)?;
        // 先持久保存旧账户，再替换 live auth；后续没有影响切换结果的必要写入。
        self.persist(&store)?;
        write_json(&current_path, &auth)
    }

    pub fn enable_file_mode(&self) -> Result<AccountStoreSnapshot, String> {
        let mut config = self.read_config()?;
        config["cli_auth_credentials_store"] = value("file");
        atomic_write(
            &self.home.join("config.toml"),
            config.to_string().as_bytes(),
        )?;
        self.snapshot()
    }

    fn ensure_file_mode(&self) -> Result<(), String> {
        if self.storage_mode()? != "file" {
            return Err("当前登录存储方式不支持账户切换，请先启用文件管理".into());
        }
        Ok(())
    }

    fn storage_mode(&self) -> Result<String, String> {
        let config = self.read_config()?;
        Ok(match config.get("cli_auth_credentials_store") {
            None => "file".into(),
            Some(item) => match item.as_str() {
                Some("file") => "file",
                Some("auto") => "auto",
                Some("keyring") => "keyring",
                _ => "unsupported",
            }
            .into(),
        })
    }

    fn read_config(&self) -> Result<DocumentMut, String> {
        let path = self.home.join("config.toml");
        let text = match read_bytes(&path) {
            Ok(bytes) => String::from_utf8(bytes).map_err(|_| "Codex 配置编码无效")?,
            Err(_) if !path.try_exists().unwrap_or(true) => String::new(),
            Err(_) => return Err("无法读取 Codex 配置，请检查文件权限".into()),
        };
        // TOML 解析器的原始错误可能附带含密钥的配置片段，不能透传。
        text.parse::<DocumentMut>()
            .map_err(|_| "Codex 配置格式无效，请先修正配置".into())
    }

    fn read_current(&self) -> Result<Value, String> {
        read_json(&self.home.join("auth.json"))
            .map_err(|_| "无法读取当前登录信息，请先登录 Codex 并使用文件存储".into())
    }

    fn load(&self) -> Result<StoreFile, String> {
        if !self.path.try_exists().map_err(|_| "无法检查账户库")? {
            return Ok(StoreFile::default());
        }
        let store: StoreFile = read_json(&self.path)
            .map_err(|_| "账户库无法读取，请检查权限或恢复备份；原文件未被覆盖")?;
        if store.version != STORE_VERSION {
            return Err("账户库版本不受支持，原文件未被覆盖".into());
        }
        Ok(store)
    }
    fn persist(&self, store: &StoreFile) -> Result<(), String> {
        write_json(&self.path, store)
    }
}

fn codex_home() -> Result<PathBuf, String> {
    let home = std::env::var_os("CODEX_HOME")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .or_else(|| {
            let variable = if cfg!(windows) { "USERPROFILE" } else { "HOME" };
            std::env::var_os(variable)
                .filter(|value| !value.is_empty())
                .map(|value| PathBuf::from(value).join(".codex"))
        })
        .ok_or("无法定位本机 Codex 目录")?;
    if !home.is_absolute() {
        return Err("CODEX_HOME 必须是绝对路径".into());
    }
    Ok(home)
}

/// Desk 自有数据统一存放在 Codex 目录同级，不读取旧应用数据目录。
pub fn data_directory() -> Result<PathBuf, String> {
    Ok(codex_home()?
        .parent()
        .ok_or("无法定位 Codex 目录的上级目录")?
        .join(DATA_DIRECTORY))
}

fn same_identity(a: &Identity, b: &Identity) -> bool {
    a.account_id == b.account_id && a.subject == b.subject
}

fn claim(token: Option<&str>) -> Option<Value> {
    let payload = token?.split('.').nth(1)?;
    serde_json::from_slice(&URL_SAFE_NO_PAD.decode(payload).ok()?).ok()
}

fn nonempty(value: Option<&Value>) -> Option<&str> {
    value
        .and_then(Value::as_str)
        .filter(|v| !v.trim().is_empty())
}

fn identity(auth: &Value) -> Result<Identity, String> {
    if auth.get("auth_mode").and_then(Value::as_str) != Some("chatgpt") {
        return Err("仅支持保存 ChatGPT 登录账户，API Key 不会进入账户库".into());
    }
    let tokens = auth.get("tokens").ok_or("登录信息不完整，请重新登录")?;
    if nonempty(tokens.get("access_token")).is_none()
        || nonempty(tokens.get("refresh_token")).is_none()
    {
        return Err("登录信息不完整，请重新登录".into());
    }
    let id_claims = claim(nonempty(tokens.get("id_token")));
    let access_claims = claim(nonempty(tokens.get("access_token")));
    let declared = nonempty(tokens.get("account_id"));
    let claim_ids: Vec<&str> = [&id_claims, &access_claims]
        .into_iter()
        .filter_map(|claims| {
            claims.as_ref().and_then(|c| {
                nonempty(
                    c.get("https://api.openai.com/auth")
                        .and_then(|v| v.get("chatgpt_account_id")),
                )
            })
        })
        .collect();
    let account_id = declared
        .or_else(|| claim_ids.first().copied())
        .ok_or("无法识别账户身份，请重新登录")?;
    if claim_ids.iter().any(|id| *id != account_id) {
        return Err("登录信息中的账户身份不一致".into());
    }
    let field = |key: &str| {
        [&id_claims, &access_claims].into_iter().find_map(|c| {
            c.as_ref()
                .and_then(|v| nonempty(v.get(key)))
                .map(str::to_owned)
        })
    };
    // JWT 解码只用于展示与记录归属，不视为服务端认证或令牌有效性校验。
    Ok(Identity {
        account_id: account_id.into(),
        subject: field("sub"),
        email: field("email"),
    })
}

fn normalized_auth(auth: &Value) -> Result<Value, String> {
    let id = identity(auth)?;
    let mut tokens = serde_json::Map::new();
    for field in ["id_token", "access_token", "refresh_token"] {
        if let Some(token) = nonempty(auth.get("tokens").and_then(|v| v.get(field))) {
            tokens.insert(field.into(), token.into());
        }
    }
    tokens.insert("account_id".into(), id.account_id.into());
    let mut result =
        serde_json::json!({ "auth_mode": "chatgpt", "OPENAI_API_KEY": null, "tokens": tokens });
    if let Some(refresh) = nonempty(auth.get("last_refresh")) {
        result["last_refresh"] = refresh.into();
    }
    Ok(result)
}

pub(crate) fn checked_label(label: &str) -> Result<String, String> {
    let label = label.trim();
    if label.is_empty()
        || label.chars().count() > MAX_LABEL_CHARS
        || label.chars().any(char::is_control)
    {
        return Err("账户名称需为 1–48 个字符，且不能包含控制字符".into());
    }
    Ok(label.into())
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn read_bytes(path: &Path) -> Result<Vec<u8>, String> {
    let metadata = fs::symlink_metadata(path).map_err(|_| "文件无法读取")?;
    if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() > MAX_FILE_BYTES {
        return Err("文件类型或大小不受支持".into());
    }
    let mut bytes = Vec::new();
    fs::File::open(path)
        .map_err(|_| "文件无法读取")?
        .take(MAX_FILE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "文件无法读取")?;
    if bytes.len() as u64 > MAX_FILE_BYTES {
        return Err("文件过大".into());
    }
    Ok(bytes)
}

fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> Result<T, String> {
    serde_json::from_slice(&read_bytes(path)?).map_err(|_| "文件格式无效".into())
}

fn write_json(path: &Path, value: &impl Serialize) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(value).map_err(|_| "无法编码本机账户信息")?;
    if bytes.len() as u64 > MAX_FILE_BYTES {
        return Err("账户库过大，请移除不再使用的账户".into());
    }
    atomic_write(path, &bytes)
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("无法定位保存目录")?;
    fs::create_dir_all(parent).map_err(|_| "无法创建保存目录")?;
    if path.try_exists().map_err(|_| "无法检查保存文件")?
        && fs::symlink_metadata(path)
            .map_err(|_| "无法检查保存文件")?
            .file_type()
            .is_symlink()
    {
        return Err("无法写入链接文件".into());
    }
    let mut file = tempfile::NamedTempFile::new_in(parent).map_err(|_| "无法创建临时保存文件")?;
    file.write_all(bytes)
        .and_then(|_| file.as_file().sync_all())
        .map_err(|_| "保存失败，原文件未被替换")?;
    file.persist(path)
        .map_err(|_| "无法替换登录信息，请检查文件权限")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn setup() -> (tempfile::TempDir, AccountStore) {
        let dir = tempfile::tempdir().unwrap();
        let store = AccountStore {
            home: dir.path().join("codex"),
            path: dir.path().join("desk").join(STORE_NAME),
        };
        (dir, store)
    }
    fn auth(id: &str, refresh: &str) -> Value {
        json!({"auth_mode":"chatgpt","tokens":{"account_id":id,"access_token":"test-access","refresh_token":refresh}})
    }

    #[test]
    fn login_name_defaults_to_authorized_email_prefix_and_allows_custom_names() {
        let (_dir, store) = setup();
        let mut login = auth("new", "refresh");
        let payload = URL_SAFE_NO_PAD
            .encode(serde_json::to_vec(&json!({"email":"peter@example.com"})).unwrap());
        login["tokens"]["id_token"] = format!("test.{payload}.test").into();
        store.save_login(&login, "   ").unwrap();
        assert_eq!(store.snapshot().unwrap().accounts[0].label, "peter");
        store.save_login(&login, " 工作账户 ").unwrap();
        assert_eq!(store.snapshot().unwrap().accounts[0].label, "工作账户");
        assert!(store.save_login(&login, "bad\nname").is_err());
        store.save_login(&auth("no-email", "refresh"), "").unwrap();
        assert!(store
            .snapshot()
            .unwrap()
            .accounts
            .iter()
            .any(|a| a.label == "ChatGPT 账户"));
        assert!(store.save_current("").is_err());
    }

    #[test]
    fn automatic_login_name_respects_the_character_limit() {
        let (_dir, store) = setup();
        let mut login = auth("new", "refresh");
        let payload = URL_SAFE_NO_PAD.encode(
            serde_json::to_vec(&json!({"email":format!("{}@example.com", "名".repeat(60))}))
                .unwrap(),
        );
        login["tokens"]["id_token"] = format!("test.{payload}.test").into();
        store.save_login(&login, "").unwrap();
        assert_eq!(
            store.snapshot().unwrap().accounts[0].label.chars().count(),
            MAX_LABEL_CHARS
        );
    }

    #[test]
    fn independent_login_saves_without_replacing_current_credentials() {
        let (_dir, store) = setup();
        write_json(&store.home.join("auth.json"), &auth("current", "original")).unwrap();
        store
            .save_login(&auth("new", "new-refresh"), "新账户")
            .unwrap();
        assert_eq!(
            store.read_current().unwrap()["tokens"]["account_id"],
            "current"
        );
        assert_eq!(store.snapshot().unwrap().accounts.len(), 1);
        store
            .save_login(&auth("new", "rotated"), "更新账户")
            .unwrap();
        assert_eq!(store.snapshot().unwrap().accounts.len(), 1);
        assert!(store
            .save_login(&json!({"auth_mode":"apikey"}), "错误")
            .is_err());
    }

    #[test]
    fn switching_keeps_rotated_credentials_and_never_serializes_secrets_to_ipc() {
        let (_dir, store) = setup();
        write_json(&store.home.join("auth.json"), &auth("a", "refresh-a")).unwrap();
        let a = store.save_current("个人").unwrap().accounts[0].id.clone();
        write_json(&store.home.join("auth.json"), &auth("b", "refresh-b")).unwrap();
        let b = store
            .save_current("工作")
            .unwrap()
            .accounts
            .iter()
            .find(|a| a.label == "工作")
            .unwrap()
            .id
            .clone();
        write_json(
            &store.home.join("auth.json"),
            &auth("b", "refresh-b-rotated"),
        )
        .unwrap();
        store.activate(&a).unwrap();
        store.activate(&b).unwrap();
        assert_eq!(
            store.read_current().unwrap()["tokens"]["refresh_token"],
            "refresh-b-rotated"
        );
        let ipc = serde_json::to_string(&store.snapshot().unwrap()).unwrap();
        assert!(
            !ipc.contains("refresh-b") && !ipc.contains("test-access") && !ipc.contains("tokens")
        );
        store.remove(&b).unwrap();
        assert_eq!(store.read_current().unwrap()["tokens"]["account_id"], "b");
    }

    #[test]
    fn corrupt_store_or_invalid_target_preserves_live_auth() {
        let (_dir, store) = setup();
        write_json(&store.home.join("auth.json"), &auth("a", "refresh-a")).unwrap();
        store.save_current("个人").unwrap();
        let before = fs::read(store.home.join("auth.json")).unwrap();
        assert!(store.activate("missing").is_err());
        fs::write(&store.path, b"broken").unwrap();
        assert!(store.save_current("新名称").is_err());
        assert!(store.activate("missing").is_err());
        assert_eq!(fs::read(store.home.join("auth.json")).unwrap(), before);
        assert_eq!(fs::read(&store.path).unwrap(), b"broken");
    }

    #[test]
    fn storage_mode_is_explicit_and_edit_preserves_existing_config() {
        let (_dir, store) = setup();
        atomic_write(
            &store.home.join("config.toml"),
            b"# keep comment\nmodel = 'example'\ncli_auth_credentials_store = 'keyring'\n",
        )
        .unwrap();
        assert!(store.save_current("个人").is_err());
        store.enable_file_mode().unwrap();
        let config = fs::read_to_string(store.home.join("config.toml")).unwrap();
        assert!(config.contains("# keep comment") && config.contains("model = 'example'"));
        assert_eq!(store.storage_mode().unwrap(), "file");
        assert!(identity(&json!({"auth_mode":"apikey","OPENAI_API_KEY":"test-key"})).is_err());
    }

    #[test]
    fn rejects_conflicting_account_claims_without_echoing_tokens() {
        let token = format!("test.{}.signature", URL_SAFE_NO_PAD.encode(serde_json::to_vec(&json!({
            "https://api.openai.com/auth": {"chatgpt_account_id":"different"}, "sub":"user-a"
        })).unwrap()));
        let mut value = auth("declared", "secret-refresh");
        value["tokens"]["id_token"] = token.clone().into();
        let error = identity(&value).err().unwrap();
        assert!(!error.contains(&token) && !error.contains("secret-refresh"));
    }

    #[test]
    fn same_workspace_with_different_users_remains_separate() {
        let (_dir, store) = setup();
        for subject in ["user-a", "user-b"] {
            let mut value = auth("workspace", "test-refresh");
            value["tokens"]["id_token"] = format!(
                "test.{}.signature",
                URL_SAFE_NO_PAD.encode(serde_json::to_vec(&json!({"sub":subject})).unwrap())
            )
            .into();
            write_json(&store.home.join("auth.json"), &value).unwrap();
            store.save_current(subject).unwrap();
        }
        assert_eq!(store.snapshot().unwrap().accounts.len(), 2);
    }

    #[cfg(windows)]
    #[test]
    fn restart_failures_distinguish_uncommitted_and_committed_credentials() {
        tauri::async_runtime::block_on(async {
            for fail in ["stop", "start"] {
                let (dir, store) = setup();
                write_json(&store.home.join("auth.json"), &auth("a", "refresh-a")).unwrap();
                let target = store.save_current("个人").unwrap().accounts[0].id.clone();
                write_json(&store.home.join("auth.json"), &auth("b", "refresh-b")).unwrap();
                let executable = dir.path().join("fake-cli.cmd");
                fs::write(&executable, format!(
                    "@echo off\r\nif \"%1\"==\"--version\" (\r\n echo codex-cli 0.160.1\r\n exit /b 0\r\n)\r\nif \"%3\"==\"{fail}\" exit /b 1\r\nexit /b 0\r\n"
                )).unwrap();
                let server = crate::app_server::AppServerState::default();
                server.configure_cli_path(Some(executable)).await;
                let result = server.apply_auth_change(store.clone(), target, true).await;
                if fail == "stop" {
                    assert!(result.is_err());
                    assert_eq!(store.read_current().unwrap()["tokens"]["account_id"], "b");
                } else {
                    assert_eq!(result.unwrap(), "startFailed");
                    assert_eq!(store.read_current().unwrap()["tokens"]["account_id"], "a");
                }
            }
        });
    }

    #[test]
    fn credentials_only_switch_does_not_execute_cli_or_restart_shared_service() {
        tauri::async_runtime::block_on(async {
            let (dir, store) = setup();
            write_json(&store.home.join("auth.json"), &auth("a", "refresh-a")).unwrap();
            let target = store.save_current("个人").unwrap().accounts[0].id.clone();
            write_json(&store.home.join("auth.json"), &auth("b", "refresh-b")).unwrap();
            let server = crate::app_server::AppServerState::default();
            server
                .configure_cli_path(Some(dir.path().join("does-not-exist.exe")))
                .await;
            assert_eq!(
                server
                    .apply_auth_change(store.clone(), target, false)
                    .await
                    .unwrap(),
                "notRequested"
            );
            assert_eq!(store.read_current().unwrap()["tokens"]["account_id"], "a");
        });
    }
}
