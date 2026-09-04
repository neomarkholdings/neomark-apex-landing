//! Filesystem watch loop for the install gate.
//!
//! Polls Downloads / Desktop for new drops. Existing files at launch are
//! inventoried, not held. `cargo test` never starts this thread.

use crate::drop_watch::DropWatch;
use crate::install_gate::{inspect_and_hold, is_incomplete_drop, watch_roots, Intercept};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Emitter, Manager};

pub fn spawn(app: AppHandle) {
    std::thread::Builder::new()
        .name("samurai-install-gate".into())
        .spawn(move || run(app))
        .ok();
}

fn live_watch_on(app: &AppHandle) -> bool {
    app.try_state::<crate::AppState>()
        .map(|state| state.live_watch_armed())
        .unwrap_or(true)
}

fn streamer_on(app: &AppHandle) -> bool {
    app.try_state::<crate::AppState>()
        .map(|state| *state.streamer_mode.lock().unwrap_or_else(|e| e.into_inner()))
        .unwrap_or(false)
}

fn record_intercept(app: &AppHandle, intercept: Intercept) {
    if let Some(state) = app.try_state::<crate::AppState>() {
        let mut log = state.intercepts.lock().unwrap_or_else(|e| e.into_inner());
        log.insert(0, intercept.clone());
        log.truncate(40);
    }
    let _ = app.emit("samurai-intercept", intercept);
}

fn mtime_key(path: &Path) -> Option<u128> {
    let meta = fs::metadata(path).ok()?;
    let modified = meta.modified().ok()?;
    Some(
        modified
            .duration_since(SystemTime::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0),
    )
}

fn list_drop_files(root: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let mut stack = vec![(root.to_path_buf(), 0u8)];
    while let Some((dir, depth)) = stack.pop() {
        if out.len() >= 250 || depth > 3 {
            continue;
        }
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push((path, depth.saturating_add(1)));
            } else if path.is_file() {
                out.push(path);
            }
        }
    }
    out
}

fn run(app: AppHandle) {
    let hold_root = app
        .path()
        .app_data_dir()
        .ok()
        .map(|dir| dir.join("install_gate"));
    let Some(hold_root) = hold_root else {
        return;
    };
    let mut watch = DropWatch::new();
    loop {
        std::thread::sleep(Duration::from_millis(1600));
        if !live_watch_on(&app) {
            continue;
        }
        let streamer = streamer_on(&app);
        for root in watch_roots() {
            for path in list_drop_files(&root) {
                if is_incomplete_drop(&path) {
                    continue;
                }
                let Some(stamp) = mtime_key(&path) else {
                    continue;
                };
                if watch.note(path.clone(), stamp) {
                    if let Some(intercept) = inspect_and_hold(&path, &hold_root, streamer) {
                        record_intercept(&app, intercept);
                    }
                }
            }
        }
        if !watch.primed() {
            watch.finish_prime();
        }
        watch.maybe_reprime();
    }
}
