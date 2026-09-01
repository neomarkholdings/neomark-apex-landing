//! Samurai EDR desktop host — Ronin Softworx (Neomark Holdings LLC).
//!
//! Thread-safe application flags live in `AppState` (`lib.rs`) and are
//! exposed through `tauri::State`:
//!   - `amoeba_auto_repair: Mutex<bool>`
//!   - `streamer_mode: Mutex<bool>`

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    samurai_lib::run()
}
