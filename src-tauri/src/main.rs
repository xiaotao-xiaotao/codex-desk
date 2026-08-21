mod quota;
mod tray;

use tauri::{
    AppHandle, LogicalSize, Manager, PhysicalPosition, Position, Size, State, WebviewWindow,
};

#[tauri::command]
async fn read_quota(state: State<'_, quota::AppServerState>) -> Result<quota::QuotaSnapshot, String> {
    quota::read_quota(&state).await
}

#[tauri::command]
async fn search_threads(
    state: State<'_, quota::AppServerState>,
    query: String,
    page: u32,
) -> Result<quota::ThreadSearchResult, String> {
    quota::search_threads(&state, &query, page).await
}

#[tauri::command]
async fn read_thread(
    state: State<'_, quota::AppServerState>,
    thread_id: String,
) -> Result<quota::ThreadDetail, String> {
    quota::read_thread(&state, &thread_id).await
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
fn resize_float_window(expanded: bool, window: WebviewWindow) -> Result<(), String> {
    // 展开后使用看板尺寸，容纳额度、会话搜索与详情入口；紧凑态仍为悬浮球。
    // 10 条会话卡片可完整显示，收紧展开高度以去除底部多余空白。
    let (width, height) = if expanded { (920.0, 640.0) } else { (84.0, 84.0) };
    let previous_size = window
        .outer_size()
        .map_err(|error| format!("无法读取悬浮窗尺寸：{error}"))?;
    let previous_position = window
        .outer_position()
        .map_err(|error| format!("无法读取悬浮窗位置：{error}"))?;
    let scale_factor = window
        .scale_factor()
        .map_err(|error| format!("无法读取屏幕缩放比例：{error}"))?;
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
    // 原生侧同时调整尺寸与位置，避免 WebView 权限或平台差异导致前端处理失效。
    window
        .set_resizable(true)
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
        .manage(quota::AppServerState::default())
        .setup(|app| {
            tray::setup(app)?;
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(error) = app_handle.state::<quota::AppServerState>().warm_up().await {
                    eprintln!("Codex app-server 预热失败，将在读取数据时重试：{error}");
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            read_quota,
            search_threads,
            read_thread,
            start_dragging,
            hide_window,
            resize_float_window,
            quit_app,
            tray::set_tray_language
        ])
        .run(tauri::generate_context!())
        .expect("启动 Codex Desk 失败");
}
