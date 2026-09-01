//! Samurai EDR — Ronin Softworx (Neomark Holdings LLC)
//!
//! Shared application state is exposed to the React console through Tauri
//! commands. Destructive work is gated by sanctuary middleware.

mod amoeba_engine;
mod samurai_engine;
mod sanctuary;

use amoeba_engine::{
    load_immunity_db, remediate, seed_demo_lab as provision_demo_lab, ImmunityDb, RemediateRequest,
};
use samurai_engine::ScanReport;
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

pub struct AppState {
    pub amoeba_auto_repair: Mutex<bool>,
    pub streamer_mode: Mutex<bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppFlags {
    amoeba_auto_repair: bool,
    streamer_mode: bool,
}

fn read_flag(lock: &Mutex<bool>) -> bool {
    *lock.lock().unwrap_or_else(|e| e.into_inner())
}

fn toggle_flag(lock: &Mutex<bool>) -> bool {
    let mut guard = lock.lock().unwrap_or_else(|e| e.into_inner());
    *guard = !*guard;
    *guard
}

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn immunity_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("immunity_db.json"))
}

#[tauri::command]
fn get_app_state(state: State<AppState>) -> AppFlags {
    AppFlags {
        amoeba_auto_repair: read_flag(&state.amoeba_auto_repair),
        streamer_mode: read_flag(&state.streamer_mode),
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
fn run_samurai_scan(
    app: AppHandle,
    state: State<AppState>,
    target_path: Option<String>,
) -> Result<ScanReport, String> {
    let dir = data_dir(&app)?;
    let immunity = dir.join("immunity_db.json");
    samurai_engine::run_scan(
        target_path,
        read_flag(&state.streamer_mode),
        read_flag(&state.amoeba_auto_repair),
        &dir,
        &immunity,
    )
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
fn seed_demo_lab(app: AppHandle) -> Result<String, String> {
    let lab = provision_demo_lab(&data_dir(&app)?)?;
    Ok(lab.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            amoeba_auto_repair: Mutex::new(true),
            streamer_mode: Mutex::new(false),
        })
        .invoke_handler(tauri::generate_handler![
            get_app_state,
            toggle_amoeba_auto_repair,
            toggle_streamer_mode,
            run_samurai_scan,
            amoeba_remediate,
            get_immunity_log,
            seed_demo_lab
        ])
        .run(tauri::generate_context!())
        .expect("error while running Samurai");
}
