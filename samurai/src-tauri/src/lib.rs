//! Samurai EDR — Ronin Softworx (Neomark Holdings LLC)
//!
//! Shared application state is exposed to the React console through Tauri
//! commands. Destructive work is gated by sanctuary middleware.

mod amoeba_engine;
mod archive;
mod drop_watch;
mod foothold;
mod install_gate;
mod protection;
mod samurai_engine;
mod sanctuary;
mod watch;
mod windows_line;

use amoeba_engine::{
    load_immunity_db, remediate, seed_demo_lab as provision_demo_lab, ImmunityDb, RemediateRequest,
};
use install_gate::Intercept;
use samurai_engine::ScanReport;
use sanctuary::is_sanctuary_path;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use windows_line::WindowsLineStatus;

pub struct AppState {
    pub amoeba_auto_repair: Mutex<bool>,
    pub streamer_mode: Mutex<bool>,
    pub live_watch: Mutex<bool>,
    pub live_watch_rearm_at: Mutex<Option<u128>>,
    pub intercepts: Mutex<Vec<Intercept>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppFlags {
    amoeba_auto_repair: bool,
    streamer_mode: bool,
    live_watch: bool,
    disarmed_until: Option<u64>,
}

fn read_flag(lock: &Mutex<bool>) -> bool {
    *lock.lock().unwrap_or_else(|e| e.into_inner())
}

fn toggle_flag(lock: &Mutex<bool>) -> bool {
    let mut guard = lock.lock().unwrap_or_else(|e| e.into_inner());
    *guard = !*guard;
    *guard
}

impl AppState {
    pub(crate) fn apply_rearm(&self) {
        let now = protection::now_ms();
        let mut live = self.live_watch.lock().unwrap_or_else(|e| e.into_inner());
        let mut deadline = self
            .live_watch_rearm_at
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        if protection::due_to_rearm(now, *live, *deadline) {
            *live = true;
            *deadline = None;
        }
    }

    pub(crate) fn live_watch_armed(&self) -> bool {
        self.apply_rearm();
        read_flag(&self.live_watch)
    }

    fn disarmed_until_ms(&self) -> Option<u64> {
        self.live_watch_rearm_at
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .map(|ms| ms as u64)
    }

    fn set_rearm_deadline(&self, armed: bool) {
        let mut deadline = self
            .live_watch_rearm_at
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        *deadline = protection::rearm_deadline(protection::now_ms(), armed);
    }

    fn rearm_now(&self) {
        *self.live_watch.lock().unwrap_or_else(|e| e.into_inner()) = true;
        *self
            .live_watch_rearm_at
            .lock()
            .unwrap_or_else(|e| e.into_inner()) = None;
    }
}

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn immunity_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("immunity_db.json"))
}

fn tools_dir(app: &AppHandle) -> PathBuf {
    if let Ok(dir) = app.path().resource_dir() {
        let engines = dir.join("engines");
        if engines.is_dir() {
            return engines;
        }
        let nested = dir.join("resources").join("engines");
        if nested.is_dir() {
            return nested;
        }
        if dir.join("yara").is_file()
            || dir.join("yara.exe").is_file()
            || dir.join("clamscan").is_file()
            || dir.join("clamscan.exe").is_file()
        {
            return dir;
        }
    }
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|parent| parent.join("engines")))
        .unwrap_or_else(|| PathBuf::from("engines"))
}

fn remember_intercepts(state: &AppState, incoming: &[Intercept]) {
    if incoming.is_empty() {
        return;
    }
    let mut log = state.intercepts.lock().unwrap_or_else(|e| e.into_inner());
    for item in incoming.iter().rev() {
        log.insert(0, item.clone());
    }
    log.truncate(40);
}

#[tauri::command]
fn get_app_state(state: State<AppState>) -> AppFlags {
    state.apply_rearm();
    let live = read_flag(&state.live_watch);
    AppFlags {
        amoeba_auto_repair: read_flag(&state.amoeba_auto_repair),
        streamer_mode: read_flag(&state.streamer_mode),
        live_watch: live,
        disarmed_until: if live { None } else { state.disarmed_until_ms() },
    }
}

#[tauri::command]
fn toggle_amoeba_auto_repair(state: State<AppState>) -> bool {
    toggle_flag(&state.amoeba_auto_repair)
}

#[tauri::command]
fn toggle_streamer_mode(state: State<AppState>) -> bool {
    toggle_flag(&state.streamer_mode)
}

#[tauri::command]
fn toggle_live_watch(state: State<AppState>) -> bool {
    state.apply_rearm();
    let next = toggle_flag(&state.live_watch);
    state.set_rearm_deadline(next);
    next
}

#[tauri::command]
fn get_intercepts(state: State<AppState>) -> Vec<Intercept> {
    state
        .intercepts
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .clone()
}

#[tauri::command]
fn release_intercept(
    state: State<AppState>,
    hold_path: String,
    original_path: String,
) -> Result<String, String> {
    if is_sanctuary_path(&original_path) {
        return Err(crate::sanctuary::ERR_SANCTUARY_ZONE.to_string());
    }
    let dest = install_gate::release_held(Path::new(&hold_path), Path::new(&original_path))?;
    let mut log = state.intercepts.lock().unwrap_or_else(|e| e.into_inner());
    log.retain(|item| {
      item.hold_path.as_deref() != Some(hold_path.as_str())
        && item.original_path != original_path
    });
    Ok(dest.to_string_lossy().into_owned())
}

#[tauri::command]
fn run_samurai_scan(
    app: AppHandle,
    state: State<AppState>,
    target_path: Option<String>,
) -> Result<ScanReport, String> {
    let dir = data_dir(&app)?;
    let immunity = dir.join("immunity_db.json");
    let hold_dir = dir.join("install_gate");
    let live = state.live_watch_armed();
    let report = samurai_engine::run_scan(
        target_path,
        read_flag(&state.streamer_mode),
        read_flag(&state.amoeba_auto_repair),
        &dir,
        &immunity,
        &tools_dir(&app),
        if live { Some(hold_dir.as_path()) } else { None },
    )?;
    remember_intercepts(&state, &report.intercepts);
    Ok(report)
}

#[tauri::command]
fn amoeba_remediate(
    app: AppHandle,
    state: State<AppState>,
    path: String,
    confirmed: bool,
) -> Result<amoeba_engine::RepairOutcome, String> {
    let immunity = immunity_path(&app)?;
    Ok(remediate(RemediateRequest {
        target: std::path::Path::new(&path),
        auto_repair: read_flag(&state.amoeba_auto_repair),
        confirmed,
        immunity_db: &immunity,
        engine_tag: "amoeba",
        redact_paths: read_flag(&state.streamer_mode),
    }))
}

#[tauri::command]
fn get_immunity_log(app: AppHandle, state: State<AppState>) -> Result<ImmunityDb, String> {
    let mut db = load_immunity_db(&immunity_path(&app)?);
    if read_flag(&state.streamer_mode) {
        for antigen in &mut db.antigens {
            antigen.source_path = "[STREAM-SHIELD]".into();
        }
    }
    Ok(db)
}

#[tauri::command]
fn seed_demo_lab(app: AppHandle, state: State<AppState>) -> Result<String, String> {
    state.rearm_now();
    let lab = provision_demo_lab(&data_dir(&app)?)?;
    Ok(lab.to_string_lossy().into_owned())
}

fn install_dir() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|parent| parent.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."))
}

#[tauri::command]
fn get_windows_line(app: AppHandle) -> WindowsLineStatus {
    let data = data_dir(&app).unwrap_or_else(|_| PathBuf::from("."));
    windows_line::query_status(&install_dir(), &data)
}

#[tauri::command]
fn align_windows_line(app: AppHandle) -> Result<String, String> {
    windows_line::request_align(&install_dir(), &data_dir(&app)?)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            amoeba_auto_repair: Mutex::new(true),
            streamer_mode: Mutex::new(false),
            live_watch: Mutex::new(true),
            live_watch_rearm_at: Mutex::new(None),
            intercepts: Mutex::new(Vec::new()),
        })
        .setup(|app| {
            watch::spawn(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_state,
            toggle_amoeba_auto_repair,
            toggle_streamer_mode,
            toggle_live_watch,
            get_intercepts,
            release_intercept,
            run_samurai_scan,
            amoeba_remediate,
            get_immunity_log,
            seed_demo_lab,
            get_windows_line,
            align_windows_line
        ])
        .run(tauri::generate_context!())
        .expect("error while running Samurai");
}
