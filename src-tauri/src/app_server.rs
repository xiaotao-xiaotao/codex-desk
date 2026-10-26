//! 账户切换后的共享 app-server 生命周期；额度和登录仍直接使用 HTTPS。
use crate::account_store::{AccountStore, SwitchOutcome};
use serde::Deserialize;
use std::{path::Path, process::Stdio};
use tokio::{
    process::Command,
    time::{timeout, Duration},
};

const DAEMON_COMMAND_TIMEOUT: Duration = Duration::from_secs(30);
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum DaemonStatus {
    Stopped,
    NotRunning,
    Started,
    AlreadyRunning,
}

#[derive(Deserialize)]
struct DaemonOutput {
    status: DaemonStatus,
}

/// 调用方持有账户写锁，避免重启期间其他切换或令牌续期覆盖目标凭据。
pub async fn apply_auth_change(
    store: AccountStore,
    id: String,
    cli_path: Option<&Path>,
) -> Result<SwitchOutcome, String> {
    let target_store = store.clone();
    tauri::async_runtime::spawn_blocking(move || target_store.activate(&id))
        .await
        .map_err(|_| "账户保存任务中断，请检查当前登录状态")??;

    // stop 的 JSON 区分 stopped / notRunning，避免把原本未运行的服务启动。
    // 状态异常时跳过 start；凭据已经落盘，必须单独报告服务状态而非回滚登录。
    let (restarted, restart_error) = match restart_if_running(cli_path).await {
        Ok(restarted) => (restarted, None),
        Err(error) => (false, Some(error)),
    };
    let snapshot = tauri::async_runtime::spawn_blocking(move || store.snapshot())
        .await
        .ok()
        .and_then(Result::ok);
    Ok(SwitchOutcome {
        restarted,
        restart_error,
        snapshot,
    })
}

async fn restart_if_running(cli_path: Option<&Path>) -> Result<bool, String> {
    match run_daemon_command(cli_path, "stop").await? {
        DaemonStatus::NotRunning => return Ok(false),
        DaemonStatus::Stopped => {}
        _ => return Err("Codex 服务停止状态异常，已跳过启动，请手动检查服务".into()),
    }
    match run_daemon_command(cli_path, "start").await? {
        DaemonStatus::Started | DaemonStatus::AlreadyRunning => Ok(true),
        _ => Err("Codex 服务启动状态异常，请手动检查服务".into()),
    }
}

async fn run_daemon_command(
    cli_path: Option<&Path>,
    operation: &str,
) -> Result<DaemonStatus, String> {
    #[cfg(target_os = "windows")]
    let mut command = {
        let executable = cli_path.unwrap_or_else(|| Path::new("codex.cmd"));
        let is_script = executable
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| {
                value.eq_ignore_ascii_case("cmd") || value.eq_ignore_ascii_case("bat")
            });
        let mut command = if is_script {
            let mut command = Command::new("cmd");
            command.args(["/D", "/C"]).arg(executable);
            command
        } else {
            Command::new(executable)
        };
        command.creation_flags(CREATE_NO_WINDOW);
        command
    };
    #[cfg(not(target_os = "windows"))]
    let mut command = Command::new(cli_path.unwrap_or_else(|| Path::new("codex")));

    // 沿用 main 分支的 daemon 管理命令，不结束其他 Codex 进程。
    let output = timeout(
        DAEMON_COMMAND_TIMEOUT,
        command
            .args(["app-server", "daemon", operation])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true)
            .output(),
    )
    .await
    .map_err(|_| format!("Codex app-server daemon {operation} 超时"))?
    .map_err(|_| {
        format!("无法执行 Codex app-server daemon {operation}，请检查 Codex CLI 是否在 PATH 中")
    })?;
    if !output.status.success() {
        return Err(format!(
            "Codex app-server daemon {operation} 失败，请手动检查服务状态"
        ));
    }
    serde_json::from_slice::<DaemonOutput>(&output.stdout)
        .map(|output| output.status)
        .map_err(|_| {
            format!("无法识别 Codex app-server daemon {operation} 返回的服务状态，请手动检查服务")
        })
}
