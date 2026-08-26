#![cfg_attr(
    all(target_os = "windows", not(debug_assertions)),
    windows_subsystem = "windows"
)]

mod account;
mod app_server;
mod quota;
mod threads;
mod tray;

use std::path::Path;
use serde::Serialize;
use tauri::{
    AppHandle, LogicalSize, Manager, PhysicalPosition, Position, Size, State, WebviewWindow,
};

const EXPANDED_WINDOW_WIDTH: f64 = 1100.0;
// 为趋势图与五行会话卡片保留可读空间，避免默认展开时依赖列表滚动。
const EXPANDED_WINDOW_HEIGHT: f64 = 820.0;
// 展开窗口与屏幕工作区保留安全边距，避免被任务栏或屏幕边缘裁切。
const WINDOW_WORK_AREA_MARGIN: i32 = 12;
// 收起态仅容纳 56px 悬浮球与阴影留白，避免透明窗口产生过大的点击区域。
const COLLAPSED_WINDOW_SIZE: f64 = 64.0;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CodexDiagnostics {
    cli_version: Option<String>,
    app_server_ready: bool,
    quota_available: bool,
    error: Option<String>,
}

#[tauri::command]
async fn read_quota(
    state: State<'_, app_server::AppServerState>,
) -> Result<quota::QuotaSnapshot, String> {
    quota::read_quota(&state).await
}

#[tauri::command]
async fn read_account(
    state: State<'_, app_server::AppServerState>,
) -> Result<account::AccountProfile, String> {
    account::read_account(&state).await
}

/// 仅检查本机 CLI、app-server 和当前登录态，不读取认证文件也不上传诊断信息。
#[tauri::command]
async fn diagnose_codex(
    state: State<'_, app_server::AppServerState>,
) -> Result<CodexDiagnostics, String> {
    let cli_version = app_server::read_cli_version().await;
    let app_server_ready = state.warm_up().await;
    let quota = if app_server_ready.is_ok() {
        quota::read_quota(&state).await.map(|_| ())
    } else {
        Err(app_server_ready.as_ref().expect_err("已确认启动失败").to_owned())
    };
    let error = cli_version
        .as_ref()
        .err()
        .or_else(|| app_server_ready.as_ref().err())
        .or_else(|| quota.as_ref().err())
        .cloned();
    Ok(CodexDiagnostics {
        cli_version: cli_version.ok(),
        app_server_ready: app_server_ready.is_ok(),
        quota_available: quota.is_ok(),
        error,
    })
}

#[tauri::command]
async fn search_threads(
    state: State<'_, app_server::AppServerState>,
    query: String,
    page: u32,
) -> Result<threads::ThreadSearchResult, String> {
    threads::search_threads(&state, &query, page).await
}

#[tauri::command]
async fn list_threads_for_selection(
    state: State<'_, app_server::AppServerState>,
    query: String,
) -> Result<Vec<threads::ThreadSummary>, String> {
    threads::list_threads_for_selection(&state, &query).await
}

#[tauri::command]
async fn export_threads(
    state: State<'_, app_server::AppServerState>,
    thread_ids: Vec<String>,
    output_path: String,
) -> Result<threads::ThreadExportSummary, String> {
    threads::export_threads_to_path(&state, &thread_ids, Path::new(&output_path)).await
}

#[tauri::command]
fn choose_export_path(
    window: WebviewWindow,
    default_file_name: String,
    filter_name: String,
) -> Option<String> {
    let filter_name = if filter_name.trim().is_empty() {
        "JSON".to_owned()
    } else {
        filter_name
    };
    rfd::FileDialog::new()
        // 绑定父窗口后，Windows 会把“另存为”作为 Desk 的模态子窗口置于最前。
        .set_parent(&window)
        .add_filter(&filter_name, &["json"])
        .set_file_name(&default_file_name)
        .save_file()
        .map(|path| path.to_string_lossy().into_owned())
}

#[tauri::command]
async fn import_threads(
    state: State<'_, app_server::AppServerState>,
    trend_state: State<'_, threads::ThreadTrendState>,
    bundle_json: String,
    imported_title_prefix: String,
    imported_history_intro: String,
) -> Result<threads::ThreadImportResult, String> {
    let result = threads::import_threads(
        &state,
        &bundle_json,
        &imported_title_prefix,
        &imported_history_intro,
    )
    .await?;
    if result.imported > 0 {
        trend_state.invalidate().await;
    }
    Ok(result)
}

#[tauri::command]
async fn read_thread(
    state: State<'_, app_server::AppServerState>,
    thread_id: String,
) -> Result<threads::ThreadDetail, String> {
    threads::read_thread(&state, &thread_id).await
}

#[tauri::command]
async fn read_thread_trends(
    state: State<'_, app_server::AppServerState>,
    trend_state: State<'_, threads::ThreadTrendState>,
    force_refresh: bool,
) -> Result<threads::ThreadTrendResponse, String> {
    threads::read_thread_trends(&state, &trend_state, force_refresh).await
}

#[tauri::command]
fn start_dragging(window: WebviewWindow) -> Result<(), String> {
    window
        .start_dragging()
        .map_err(|error| format!("无法拖动悬浮窗：{error}"))
}

#[tauri::command]
fn hide_window(window: WebviewWindow) -> Result<(), String> {
    // 最小化后保留常驻 app-server，用户可从托盘菜单恢复悬浮窗。
    window
        .hide()
        .map_err(|error| format!("无法最小化悬浮窗：{error}"))
}

#[tauri::command]
fn toggle_window_maximized(window: WebviewWindow) -> Result<(), String> {
    if window
        .is_maximized()
        .map_err(|error| format!("无法读取窗口最大化状态：{error}"))?
    {
        window
            .unmaximize()
            .map_err(|error| format!("无法还原窗口尺寸：{error}"))
    } else {
        window
            .maximize()
            .map_err(|error| format!("无法最大化窗口：{error}"))
    }
}

#[tauri::command]
fn resize_float_window(expanded: bool, window: WebviewWindow) -> Result<(), String> {
    // 展开后为趋势图与会话卡片保留完整阅读空间；紧凑态仍为悬浮球。
    let (preferred_width, preferred_height) = if expanded {
        (EXPANDED_WINDOW_WIDTH, EXPANDED_WINDOW_HEIGHT)
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
    tray::close_app_server_and_exit(app);
}

fn main() {
    tauri::Builder::default()
        .manage(app_server::AppServerState::default())
        .manage(threads::ThreadTrendState::default())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            tray::setup(app)?;
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(error) = app_handle
                    .state::<app_server::AppServerState>()
                    .warm_up()
                    .await
                {
                    eprintln!("Codex app-server 预热失败，将在读取数据时重试：{error}");
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_quota,
            read_account,
            diagnose_codex,
            search_threads,
            list_threads_for_selection,
            export_threads,
            choose_export_path,
            import_threads,
            read_thread,
            read_thread_trends,
            start_dragging,
            hide_window,
            toggle_window_maximized,
            resize_float_window,
            quit_app,
            tray::set_tray_language
        ])
        .run(tauri::generate_context!())
        .expect("启动 Codex Desk 失败");
}
