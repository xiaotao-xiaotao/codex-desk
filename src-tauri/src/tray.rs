use crate::app_server;
use tauri::{
    menu::{MenuBuilder, MenuItem, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, Emitter, Manager,
};

/// 原生托盘属于 Rust 进程，无法读取 WebView 的 localStorage。
/// 保留菜单项句柄后，前端切换语言时可原地更新文本，不会闪烁或丢失点击事件。
struct TrayMenuItems {
    show: MenuItem<tauri::Wry>,
    refresh: MenuItem<tauri::Wry>,
    restart: MenuItem<tauri::Wry>,
    quit: MenuItem<tauri::Wry>,
}

struct TrayLabels {
    show: &'static str,
    refresh: &'static str,
    restart: &'static str,
    quit: &'static str,
    tooltip: &'static str,
}

fn labels_for(language: &str) -> TrayLabels {
    match language {
        "zh-TW" => TrayLabels {
            show: "顯示",
            refresh: "重新整理",
            restart: "重啟",
            quit: "結束",
            tooltip: "Codex 桌面控制台",
        },
        "ja" => TrayLabels {
            show: "表示",
            refresh: "更新",
            restart: "再起動",
            quit: "終了",
            tooltip: "Codex デスク",
        },
        "ko" => TrayLabels {
            show: "표시",
            refresh: "새로 고침",
            restart: "다시 시작",
            quit: "종료",
            tooltip: "Codex 데스크",
        },
        "en" => TrayLabels {
            show: "Show",
            refresh: "Refresh",
            restart: "Restart",
            quit: "Quit",
            tooltip: "Codex Desk",
        },
        // 前端已将不支持的系统语言解析为 en；异常值保留简体中文兜底。
        _ => TrayLabels {
            show: "显示",
            refresh: "刷新",
            restart: "重启",
            quit: "退出",
            tooltip: "Codex 桌面控制台",
        },
    }
}

pub fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// 应用退出时显式结束常驻 app-server，避免子进程依赖操作系统回收。
pub fn close_app_server_and_exit(app: AppHandle) {
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        app_handle
            .state::<app_server::AppServerState>()
            .shutdown()
            .await;
        app_handle.exit(0);
    });
}

/// 先断开本机 CLI 连接，再由 Tauri 在当前实例退出后拉起新实例，避免触发单实例冲突。
pub fn restart_app(app: AppHandle) {
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        app_handle
            .state::<app_server::AppServerState>()
            .shutdown()
            .await;
        app_handle.request_restart();
    });
}

/// 创建托盘菜单及鼠标事件。菜单文本默认中文，WebView 初始化后会立即同步语言。
pub fn setup(app: &mut App) -> tauri::Result<()> {
    // Windows 原生托盘菜单按最长文案计算宽度，使用简短标签减少横向占用。
    let show = MenuItemBuilder::with_id("show", "显示").build(app)?;
    let refresh = MenuItemBuilder::with_id("refresh", "刷新").build(app)?;
    let restart = MenuItemBuilder::with_id("restart", "重启").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "退出").build(app)?;
    let tray_menu = MenuBuilder::new(app)
        .items(&[&show, &refresh, &restart, &quit])
        .build()?;
    app.manage(TrayMenuItems {
        show: show.clone(),
        refresh: refresh.clone(),
        restart: restart.clone(),
        quit: quit.clone(),
    });

    // TrayIconBuilder 不会自动继承窗口图标；显式设置后 Windows 才会显示托盘项。
    let tray_icon = app
        .default_window_icon()
        .cloned()
        .expect("应用默认图标未配置");
    TrayIconBuilder::with_id("quota-tray")
        .icon(tray_icon)
        .tooltip("Codex 桌面控制台")
        .menu(&tray_menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "refresh" => {
                show_main_window(app);
                let _ = app.emit("quota://refresh", ());
            }
            "restart" => restart_app(app.clone()),
            "quit" => close_app_server_and_exit(app.clone()),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

/// 由 WebView 传递当前已解析的语言代码，动态同步原生菜单和 tooltip。
#[tauri::command]
pub fn set_tray_language(language: String, app: AppHandle) -> Result<(), String> {
    let labels = labels_for(&language);
    let items = app.state::<TrayMenuItems>();
    items
        .show
        .set_text(labels.show)
        .map_err(|error| format!("无法更新托盘显示菜单：{error}"))?;
    items
        .refresh
        .set_text(labels.refresh)
        .map_err(|error| format!("无法更新托盘刷新菜单：{error}"))?;
    items
        .restart
        .set_text(labels.restart)
        .map_err(|error| format!("无法更新托盘重启菜单：{error}"))?;
    items
        .quit
        .set_text(labels.quit)
        .map_err(|error| format!("无法更新托盘退出菜单：{error}"))?;
    if let Some(tray) = app.tray_by_id("quota-tray") {
        tray.set_tooltip(Some(labels.tooltip))
            .map_err(|error| format!("无法更新托盘提示：{error}"))?;
    }
    Ok(())
}
