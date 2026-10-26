#![cfg_attr(
    all(target_os = "windows", not(debug_assertions)),
    windows_subsystem = "windows"
)]

mod account_login;
mod account_store;
mod app_server;
mod http_client;
mod oauth;
mod quota;
mod tray;

use std::process::Command;
use tauri::{
    AppHandle, LogicalSize, Manager, PhysicalPosition, Position, Size, State, WebviewWindow,
};

const EXPANDED_WINDOW_WIDTH: f64 = 1020.0;
// 账户用量与账户列表共用固定窗口高度。
const DASHBOARD_WINDOW_HEIGHT: f64 = 820.0;
// 展开窗口与屏幕工作区保留安全边距，避免被任务栏或屏幕边缘裁切。
const WINDOW_WORK_AREA_MARGIN: i32 = 12;
// 收起态仅容纳 56px 悬浮球与阴影留白，避免透明窗口产生过大的点击区域。
const COLLAPSED_WINDOW_SIZE: f64 = 64.0;
const CHATGPT_BILLING_URL: &str = "https://chatgpt.com/settings/billing";
const CODEX_USAGE_URL: &str = "https://chatgpt.com/settings/usage";

#[tauri::command]
async fn read_account_quotas(
    app: AppHandle,
    state: State<'_, account_store::AccountStoreState>,
    network: State<'_, http_client::HttpState>,
) -> Result<Vec<quota::AccountQuotaSnapshot>, String> {
    let _batch = network.quota_gate.lock().await;
    // 只在读取账户快照时持锁，远端查询期间允许保存、删除和切换账户。
    let targets = {
        let _guard = state.0.lock().await;
        let store = account_store::AccountStore::from_app(&app)?;
        tauri::async_runtime::spawn_blocking(move || store.quota_targets())
            .await
            .map_err(|_| "账户读取任务中断")??
    };
    let client = network.client(quota::QUOTA_REQUEST_TIMEOUT)?;
    let outcomes = quota::read_account_quotas(targets, &client).await;
    let mut snapshots = Vec::with_capacity(outcomes.len());
    for mut outcome in outcomes {
        if let Some(auth) = outcome.refreshed_auth.take() {
            let _guard = state.0.lock().await;
            let store = account_store::AccountStore::from_app(&app)?;
            let saved = tauri::async_runtime::spawn_blocking(move || {
                store.persist_refreshed_auth(&outcome.target, &auth)
            })
            .await;
            if !matches!(saved, Ok(Ok(()))) {
                outcome.snapshot.success = false;
                outcome.snapshot.windows.clear();
                outcome.snapshot.error =
                    Some("登录凭据已续期，但保存失败，请检查账户目录写入权限后重新登录".into());
            }
        }
        snapshots.push(outcome.snapshot);
    }
    Ok(snapshots)
}

#[tauri::command]
fn read_settings_directory() -> Result<String, String> {
    // 与账户库和 WebView 偏好复用同一目录规则，兼容系统差异及自定义 CODEX_HOME。
    account_store::data_directory().map(|path| path.to_string_lossy().into_owned())
}

#[tauri::command]
async fn start_account_login(
    app: AppHandle,
    state: State<'_, account_login::AccountLoginState>,
    label: String,
    method: Option<account_login::LoginMethod>,
) -> Result<account_login::LoginStatus, String> {
    state.start(app, label, method.unwrap_or_default()).await
}

#[tauri::command]
async fn read_account_login(
    state: State<'_, account_login::AccountLoginState>,
    session_id: String,
) -> Result<account_login::LoginStatus, String> {
    state.status(&session_id).await
}

#[tauri::command]
async fn cancel_account_login(
    state: State<'_, account_login::AccountLoginState>,
    session_id: String,
) -> Result<(), String> {
    state.cancel(&session_id).await
}

#[tauri::command]
async fn open_account_login_page(
    state: State<'_, account_login::AccountLoginState>,
    session_id: String,
) -> Result<(), String> {
    state.reopen(&session_id).await
}

#[tauri::command]
async fn list_saved_accounts(
    app: AppHandle,
    state: State<'_, account_store::AccountStoreState>,
) -> Result<account_store::AccountStoreSnapshot, String> {
    let _guard = state.0.lock().await;
    let store = account_store::AccountStore::from_app(&app)?;
    tauri::async_runtime::spawn_blocking(move || store.snapshot())
        .await
        .map_err(|_| "账户读取任务中断")?
}

#[tauri::command]
async fn save_current_account(
    app: AppHandle,
    state: State<'_, account_store::AccountStoreState>,
    label: String,
) -> Result<account_store::AccountStoreSnapshot, String> {
    let _guard = state.0.lock().await;
    let store = account_store::AccountStore::from_app(&app)?;
    tauri::async_runtime::spawn_blocking(move || store.save_current(&label))
        .await
        .map_err(|_| "账户保存任务中断")?
}

#[tauri::command]
async fn rename_saved_account(
    app: AppHandle,
    state: State<'_, account_store::AccountStoreState>,
    id: String,
    label: String,
) -> Result<account_store::AccountStoreSnapshot, String> {
    let _guard = state.0.lock().await;
    let store = account_store::AccountStore::from_app(&app)?;
    tauri::async_runtime::spawn_blocking(move || store.rename(&id, &label))
        .await
        .map_err(|_| "账户更新任务中断")?
}

#[tauri::command]
async fn remove_saved_account(
    app: AppHandle,
    state: State<'_, account_store::AccountStoreState>,
    id: String,
) -> Result<account_store::AccountStoreSnapshot, String> {
    let _guard = state.0.lock().await;
    let store = account_store::AccountStore::from_app(&app)?;
    tauri::async_runtime::spawn_blocking(move || store.remove(&id))
        .await
        .map_err(|_| "账户删除任务中断")?
}

#[tauri::command]
async fn enable_account_file_storage(
    app: AppHandle,
    state: State<'_, account_store::AccountStoreState>,
) -> Result<account_store::AccountStoreSnapshot, String> {
    let _guard = state.0.lock().await;
    let store = account_store::AccountStore::from_app(&app)?;
    tauri::async_runtime::spawn_blocking(move || store.enable_file_mode())
        .await
        .map_err(|_| "配置保存任务中断")?
}

#[tauri::command]
async fn switch_saved_account(
    app: AppHandle,
    state: State<'_, account_store::AccountStoreState>,
    id: String,
) -> Result<account_store::SwitchOutcome, String> {
    let _guard = state.0.lock().await;
    let store = account_store::AccountStore::from_app(&app)?;
    app_server::apply_auth_change(store, id, None).await
}

/// 网络配置同时作用于额度、登录和凭据续期，无需重启服务。
#[tauri::command]
async fn configure_network(
    state: State<'_, http_client::HttpState>,
    proxy_mode: Option<String>,
    proxy_url: Option<String>,
) -> Result<(), String> {
    state.configure(
        proxy_mode.as_deref().unwrap_or("system"),
        proxy_url.as_deref().unwrap_or(""),
    )
}

/// 在系统默认浏览器中打开官方账单入口；具体订阅门户由 ChatGPT 按登录态和购买渠道处理。
#[tauri::command]
fn open_billing_page() -> Result<(), String> {
    open_external_url(CHATGPT_BILLING_URL, "ChatGPT 账单页面")
}

#[tauri::command]
fn open_quota_reset_page() -> Result<(), String> {
    open_external_url(CODEX_USAGE_URL, "Codex 用量页面")
}

fn open_external_url(url: &str, label: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let mut command = {
        // OAuth URL 带有 & 等查询分隔符，直接交给系统 URL handler，避免 shell 解释。
        let mut command = Command::new("rundll32.exe");
        command.arg("url.dll,FileProtocolHandler").arg(url);
        command
    };
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg(url);
        command
    };
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(url);
        command
    };
    #[cfg(not(any(target_os = "windows", target_os = "macos", unix)))]
    return Err(format!("当前系统不支持打开{label}"));

    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("无法打开{label}：{error}"))
}

#[tauri::command]
fn start_dragging(window: WebviewWindow) -> Result<(), String> {
    window
        .start_dragging()
        .map_err(|error| format!("无法拖动悬浮窗：{error}"))
}

#[tauri::command]
fn hide_window(window: WebviewWindow) -> Result<(), String> {
    // 最小化后继续后台刷新，用户可从托盘菜单恢复悬浮窗。
    window
        .hide()
        .map_err(|error| format!("无法最小化悬浮窗：{error}"))
}

#[tauri::command]
fn toggle_window_maximized(window: WebviewWindow) -> Result<bool, String> {
    if window
        .is_maximized()
        .map_err(|error| format!("无法读取窗口最大化状态：{error}"))?
    {
        window
            .unmaximize()
            .map_err(|error| format!("无法还原窗口尺寸：{error}"))?;
        Ok(false)
    } else {
        window
            .maximize()
            .map_err(|error| format!("无法最大化窗口：{error}"))?;
        Ok(true)
    }
}

#[tauri::command]
fn set_window_always_on_top(always_on_top: bool, window: WebviewWindow) -> Result<(), String> {
    window
        .set_always_on_top(always_on_top)
        .map_err(|error| format!("无法切换窗口置顶状态：{error}"))
}

#[tauri::command]
fn resize_float_window(expanded: bool, window: WebviewWindow) -> Result<(), String> {
    let (preferred_width, preferred_height) = if expanded {
        (EXPANDED_WINDOW_WIDTH, DASHBOARD_WINDOW_HEIGHT)
    } else {
        (COLLAPSED_WINDOW_SIZE, COLLAPSED_WINDOW_SIZE)
    };
    let previous_size = window
        .outer_size()
        .map_err(|error| format!("无法读取悬浮窗尺寸：{error}"))?;
    let previous_position = window
        .outer_position()
        .map_err(|error| format!("无法读取悬浮窗位置：{error}"))?;
    let scale_factor = window
        .scale_factor()
        .map_err(|error| format!("无法读取屏幕缩放比例：{error}"))?;
    // 不能只钳制坐标：当固定尺寸大于工作区时，窗口仍会从底部溢出。
    // 这里先按当前显示器的实际工作区缩小逻辑尺寸，再计算位置，兼容高 DPI 缩放。
    let (width, height) = if expanded {
        if let Some(monitor) = window.current_monitor().ok().flatten() {
            let work_area = monitor.work_area();
            let available_width =
                (work_area.size.width as i32 - WINDOW_WORK_AREA_MARGIN * 2).max(1) as f64;
            let available_height =
                (work_area.size.height as i32 - WINDOW_WORK_AREA_MARGIN * 2).max(1) as f64;
            (
                preferred_width.min(available_width / scale_factor),
                preferred_height.min(available_height / scale_factor),
            )
        } else {
            (preferred_width, preferred_height)
        }
    } else {
        (preferred_width, preferred_height)
    };
    let target_width = (width * scale_factor).round() as i32;
    let target_height = (height * scale_factor).round() as i32;
    // 以悬浮球/当前窗口的中心为锚点缩放，而非固定左上角，展开不会只向右下延伸。
    let mut target_position = PhysicalPosition::new(
        previous_position.x + (previous_size.width as i32 - target_width) / 2,
        previous_position.y + (previous_size.height as i32 - target_height) / 2,
    );
    if let Some(monitor) = window.current_monitor().ok().flatten() {
        let work_area = monitor.work_area();
        let max_x = (work_area.position.x + work_area.size.width as i32 - target_width)
            .max(work_area.position.x);
        let max_y = (work_area.position.y + work_area.size.height as i32 - target_height)
            .max(work_area.position.y);
        target_position.x = target_position.x.clamp(work_area.position.x, max_x);
        target_position.y = target_position.y.clamp(work_area.position.y, max_y);
    }
    // 窗口保持不可手动缩放，避免 Windows 在拖至屏幕边缘时显示 Snap 贴靠预览；
    // 程序仍可通过原生 API 切换展开和收起尺寸。
    window
        // 从最大化状态收起后必须先还原，才能可靠地设置为悬浮球或默认展开尺寸。
        .unmaximize()
        .and_then(|_| window.set_size(Size::Logical(LogicalSize::new(width, height))))
        .and_then(|_| window.set_position(Position::Physical(target_position)))
        .map_err(|error| format!("无法调整悬浮窗尺寸：{error}"))
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    tray::shutdown_and_exit(app);
}

fn main() {
    let data_directory = account_store::data_directory().expect("无法定位 Codex Desk 数据目录");
    let mut context = tauri::generate_context!();
    // 手动创建窗口才能给 WebView 设置绝对数据路径，包含偏好设置和浏览器缓存。
    for window in &mut context.config_mut().app.windows {
        window.create = false;
    }
    tauri::Builder::default()
        .manage(http_client::HttpState::default())
        .manage(account_store::AccountStoreState::default())
        .manage(account_login::AccountLoginState::default())
        .plugin(tauri_plugin_notification::init())
        // 第二次启动由首个实例接收，并唤起已有窗口，避免重复连接与悬浮窗。
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            tray::show_main_window(app);
        }))
        .setup(move |app| {
            std::fs::create_dir_all(&data_directory)?;
            for window in &app.config().app.windows {
                tauri::WebviewWindowBuilder::from_config(app, window)?
                    .data_directory(data_directory.join("webview").join(&window.label))
                    .build()?;
            }
            tray::setup(app)?;
            if let Some(window) = app.get_webview_window("main") {
                // 首次启动由原生层保证主面板尺寸和前台可见，不能依赖 WebView 初始化完成后再补救。
                // 否则前端加载异常或 Windows 恢复出错误窗口尺寸时，只能看到托盘图标。
                if let Err(error) = resize_float_window(true, window) {
                    eprintln!("初始化主面板尺寸失败：{error}");
                }
            }
            tray::show_main_window(app.handle());
            // 前端恢复代理偏好后再发起网络请求。
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_account_quotas,
            read_settings_directory,
            list_saved_accounts,
            save_current_account,
            start_account_login,
            read_account_login,
            cancel_account_login,
            open_account_login_page,
            switch_saved_account,
            rename_saved_account,
            remove_saved_account,
            enable_account_file_storage,
            configure_network,
            open_billing_page,
            open_quota_reset_page,
            start_dragging,
            hide_window,
            toggle_window_maximized,
            set_window_always_on_top,
            resize_float_window,
            quit_app,
            tray::set_tray_language
        ])
        .run(context)
        .expect("启动 Codex Desk 失败");
}
