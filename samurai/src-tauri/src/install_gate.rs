//! Install gate — on-write hold for high-risk drops.
//!
//! Watches Downloads / Desktop (never sanctuary). Crack/keygen/activator
//! bait, disguised creations, and masquerade system binaries are moved into
//! `{app_data}/install_gate/` so they cannot execute from the drop folder.
//! Sanctuary hits are alert-only.

use crate::foothold::hold_reason;
use crate::sanctuary::is_sanctuary;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Intercept {
    pub original_path: String,
    pub hold_path: Option<String>,
    pub reason: String,
    pub kind: String,
}

pub fn watch_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    let home = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE"));
    if let Some(home) = home {
        let home = PathBuf::from(home);
        roots.push(home.join("Downloads"));
        roots.push(home.join("Desktop"));
        roots.push(home.join("downloads"));
        roots.push(home.join("desktop"));
    }
    roots.retain(|path| path.is_dir());
    roots
}

pub fn is_incomplete_drop(path: &Path) -> bool {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    name.ends_with(".crdownload")
        || name.ends_with(".part")
        || name.ends_with(".tmp")
        || name.ends_with(".download")
        || name.starts_with('.')
}

fn stamp() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

/// Move a drop into the install-gate vault. Never touches sanctuary.
pub fn hold_drop(src: &Path, hold_root: &Path) -> Result<PathBuf, String> {
    if is_sanctuary(src) {
        return Err(crate::sanctuary::ERR_SANCTUARY_ZONE.to_string());
    }
    fs::create_dir_all(hold_root).map_err(|e| e.to_string())?;
    let name = src
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "drop.bin".into());
    let dest = hold_root.join(format!("{}__{}", stamp(), name));
    if dest.exists() {
        return Err("install-gate vault collision".into());
    }
    match fs::rename(src, &dest) {
        Ok(()) => Ok(dest),
        Err(_) => {
            fs::copy(src, &dest).map_err(|e| e.to_string())?;
            fs::remove_file(src).map_err(|e| e.to_string())?;
            Ok(dest)
        }
    }
}

pub fn inspect_and_hold(path: &Path, hold_root: &Path, streamer: bool) -> Option<Intercept> {
    if is_incomplete_drop(path) || !path.is_file() {
        return None;
    }
    let Some(reason) = hold_reason(path) else {
        return None;
    };
    let shown_original = if streamer {
        path.file_name()
            .map(|n| format!("[STREAM-SHIELD]/{}", n.to_string_lossy()))
            .unwrap_or_else(|| "[STREAM-SHIELD]".into())
    } else {
        path.to_string_lossy().into_owned()
    };
    if is_sanctuary(path) {
        return Some(Intercept {
            original_path: shown_original,
            hold_path: None,
            reason,
            kind: "sanctuary_alert".into(),
        });
    }
    match hold_drop(path, hold_root) {
        Ok(held) => {
            let hold_shown = if streamer {
                held.file_name()
                    .map(|n| format!("[STREAM-SHIELD]/{}", n.to_string_lossy()))
                    .unwrap_or_else(|| "[STREAM-SHIELD]".into())
            } else {
                held.to_string_lossy().into_owned()
            };
            Some(Intercept {
                original_path: shown_original,
                hold_path: Some(hold_shown),
                reason,
                kind: "held".into(),
            })
        }
        Err(_) => None,
    }
}

pub fn hold_scan_files(
    files: &[PathBuf],
    hold_root: &Path,
    streamer: bool,
) -> Vec<Intercept> {
    let mut out = Vec::new();
    for path in files {
        if let Some(intercept) = inspect_and_hold(path, hold_root, streamer) {
            out.push(intercept);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "samurai-gate-{}-{}-{}",
            label,
            std::process::id(),
            stamp()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn holds_crack_drop_and_leaves_source_gone() {
        let root = temp("crack");
        let downloads = root.join("Downloads");
        let vault = root.join("install_gate");
        fs::create_dir_all(&downloads).unwrap();
        let bait = downloads.join("FLStudio-crack.exe");
        fs::write(&bait, b"MZ-not-a-real-installer").unwrap();
        let intercept = inspect_and_hold(&bait, &vault, false).expect("hold");
        assert_eq!(intercept.kind, "held");
        assert!(intercept.reason.contains("Crack/keygen"));
        assert!(!bait.exists());
        let held = PathBuf::from(intercept.hold_path.unwrap());
        assert!(held.exists());
        assert!(fs::read(&held).unwrap().starts_with(b"MZ"));
    }

    #[test]
    fn sanctuary_alert_does_not_move_the_file() {
        let root = temp("music");
        let music = root.join("Music");
        let vault = root.join("install_gate");
        fs::create_dir_all(&music).unwrap();
        let vocal = music.join("vocal.wav");
        fs::write(&vocal, b"MZ\x90\x00not-riff").unwrap();
        let intercept = inspect_and_hold(&vocal, &vault, false).expect("alert");
        assert_eq!(intercept.kind, "sanctuary_alert");
        assert!(intercept.hold_path.is_none());
        assert!(vocal.exists());
        assert_eq!(fs::read(&vocal).unwrap(), b"MZ\x90\x00not-riff");
    }

    #[test]
    fn skips_chrome_partial_downloads() {
        let root = temp("partial");
        let vault = root.join("install_gate");
        let part = root.join("FLStudio-crack.exe.crdownload");
        fs::write(&part, b"partial").unwrap();
        assert!(inspect_and_hold(&part, &vault, false).is_none());
        assert!(part.exists());
    }
}
