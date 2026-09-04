//! Resident tray — sit silently, signal once, never steal the session.

use crate::AppState;
use serde::Serialize;
use std::path::PathBuf;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Runtime};

pub const TRAY_ID: &str = "samurai-tray";
pub const SILENT_FLAG: &str = "--silent";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResidentStatus {
    pub host: String,
    pub tray: bool,
    pub autostart: bool,
    pub silent: bool,
    pub summary: String,
}

pub fn tooltip(held: usize, armed: bool) -> String {
    if !armed {
        return "Samurai · disarmed".into();
    }
    match held {
        0 => "Samurai · at rest".into(),
        1 => "Samurai · held a drop".into(),
        n => format!("Samurai · held {n} drops"),
    }
}

/// Holds never raise the console. The operator comes to the tray.
pub fn should_raise_console_on_hold() -> bool {
    false
}

pub fn is_silent_launch() -> bool {
    std::env::args().any(|arg| arg == SILENT_FLAG)
}

fn autostart_off_path<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|dir| dir.join("autostart_off"))
}

fn console_seen_path<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    app.path()
        .app_data_dir()
        .ok()
        .map(|dir| dir.join("console_seen"))
}

fn mark_console_seen<R: Runtime>(app: &AppHandle<R>) {
    if let Some(path) = console_seen_path(app) {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::write(path, b"1");
    }
}

pub fn should_show_console<R: Runtime>(app: &AppHandle<R>, silent: bool) -> bool {
    if silent {
        return false;
    }
    if cfg!(debug_assertions) {
        return true;
    }
    let Some(path) = console_seen_path(app) else {
        return true;
    };
    if path.exists() {
        return false;
    }
    mark_console_seen(app);
    true
}

fn held_count<R: Runtime>(app: &AppHandle<R>) -> usize {
    app.try_state::<AppState>()
        .map(|state| {
            state
                .intercepts
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .iter()
                .filter(|item| item.kind == "held" || item.kind == "sanctuary_alert")
                .count()
        })
        .unwrap_or(0)
}

fn armed<R: Runtime>(app: &AppHandle<R>) -> bool {
    app.try_state::<AppState>()
        .map(|state| state.live_watch_armed())
        .unwrap_or(true)
}

pub fn sync_tray<R: Runtime>(app: &AppHandle<R>) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    let _ = tray.set_tooltip(Some(tooltip(held_count(app), armed(app))));
}

pub fn sit_from_window<R: Runtime>(window: &tauri::Window<R>) {
    let _ = window.hide();
    let _ = window.set_skip_taskbar(true);
    mark_console_seen(window.app_handle());
}

pub fn sit<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
        let _ = window.set_skip_taskbar(true);
        mark_console_seen(app);
    }
}

pub fn reveal<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let _ = window.set_skip_taskbar(false);
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
}

pub fn desktop_summary() -> &'static str {
    "Sits in the tray. Holds do not pop the console, toast, or steal focus. Click the tray when you are ready."
}

pub fn autostart_enabled<R: Runtime>(app: &AppHandle<R>) -> bool {
    use tauri_plugin_autostart::ManagerExt;
    if autostart_off_path(app).map(|path| path.exists()).unwrap_or(false) {
        return false;
    }
    app.autolaunch().is_enabled().unwrap_or(false)
}

pub fn set_autostart<R: Runtime>(app: &AppHandle<R>, enable: bool) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    let mgr = app.autolaunch();
    if enable {
        if let Some(path) = autostart_off_path(app) {
            let _ = std::fs::remove_file(path);
        }
        mgr.enable().map_err(|e| e.to_string())?;
        Ok(true)
    } else {
        if let Some(path) = autostart_off_path(app) {
            if let Some(parent) = path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let _ = std::fs::write(path, b"1");
        }
        mgr.disable().map_err(|e| e.to_string())?;
        Ok(false)
    }
}

pub fn bootstrap_autostart<R: Runtime>(app: &AppHandle<R>) {
    if cfg!(debug_assertions) {
        return;
    }
    if autostart_off_path(app).map(|path| path.exists()).unwrap_or(false) {
        let _ = set_autostart(app, false);
        return;
    }
    let _ = set_autostart(app, true);
}

pub fn status<R: Runtime>(app: &AppHandle<R>, silent: bool) -> ResidentStatus {
    ResidentStatus {
        host: "desktop".into(),
        tray: true,
        autostart: autostart_enabled(app),
        silent,
        summary: desktop_summary().into(),
    }
}

pub fn install<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open console", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Samurai", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;
    let Some(icon) = app.default_window_icon().cloned() else {
        return Ok(());
    };
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .tooltip(tooltip(0, true))
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => reveal(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                reveal(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn idle_tooltip_is_quiet() {
        assert_eq!(tooltip(0, true), "Samurai · at rest");
    }

    #[test]
    fn hold_tooltip_does_not_shout() {
        assert_eq!(tooltip(1, true), "Samurai · held a drop");
        assert_eq!(tooltip(3, true), "Samurai · held 3 drops");
        assert_eq!(tooltip(1, false), "Samurai · disarmed");
    }

    #[test]
    fn a_hold_does_not_raise_the_console() {
        assert!(!should_raise_console_on_hold());
    }
}
