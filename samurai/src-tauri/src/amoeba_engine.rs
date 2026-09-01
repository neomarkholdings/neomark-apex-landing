//! Amoeba repair module — macrophage / phagocyte workflow.
//!
//! Localized backup references live beside the target as
//! `{parent}/.amoeba_shadow/{filename}`. On Windows, a Volume Shadow Copy
//! hook is reserved for the same restore path once a shadow candidate exists.

use crate::sanctuary::assert_not_sanctuary;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum RepairOutcome {
    Repaired {
        path: String,
        message: String,
        #[serde(rename = "antigenSha256")]
        antigen_sha256: String,
    },
    AwaitingConfirmation {
        path: String,
        message: String,
    },
    SanctuaryAbort {
        path: String,
        message: String,
    },
    Failed {
        path: String,
        message: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Antigen {
    pub sha256: String,
    pub synthesized_at: u64,
    pub source_path: String,
    pub engine: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImmunityDb {
    pub version: u32,
    pub antigens: Vec<Antigen>,
}

impl Default for ImmunityDb {
    fn default() -> Self {
        Self {
            version: 1,
            antigens: Vec::new(),
        }
    }
}

pub struct RemediateRequest<'a> {
    pub target: &'a Path,
    pub auto_repair: bool,
    pub confirmed: bool,
    pub immunity_db: &'a Path,
    pub engine_tag: &'a str,
    pub redact_paths: bool,
}

pub fn backup_reference(target: &Path) -> PathBuf {
    let file_name = target.file_name().unwrap_or_default();
    match target.parent() {
        Some(parent) => parent.join(".amoeba_shadow").join(file_name),
        None => PathBuf::from(".amoeba_shadow").join(file_name),
    }
}

/// Volume Shadow Copy / previous-version hook.
/// Prototype: reuse localized `.amoeba_shadow` stock. A production Windows
/// build would query `IVssBackupComponents` here — never a raw `vssadmin` pipe.
pub fn volume_shadow_candidate(target: &Path) -> Option<PathBuf> {
    let local = backup_reference(target);
    if local.is_file() {
        return Some(local);
    }
    #[cfg(windows)]
    {
        let _ = target;
    }
    None
}

pub fn sha256_bytes(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

pub fn sha256_file(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|e| format!("Unable to hash target: {e}"))?;
    Ok(sha256_bytes(&bytes))
}

pub fn load_immunity_db(path: &Path) -> ImmunityDb {
    let Ok(raw) = fs::read_to_string(path) else {
        return ImmunityDb::default();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

pub fn known_antigen(db: &ImmunityDb, digest: &str) -> bool {
    db.antigens.iter().any(|a| a.sha256 == digest)
}

fn unix_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn display_path(path: &Path, redact: bool) -> String {
    if !redact {
        return path.to_string_lossy().into_owned();
    }
    path.file_name()
        .map(|n| format!("[STREAM-SHIELD]/{}", n.to_string_lossy()))
        .unwrap_or_else(|| "[STREAM-SHIELD]".into())
}

/// Antigen Presentation Protocol — persist the eradicated signature locally.
pub fn present_antigen(
    immunity_db: &Path,
    digest: String,
    source_path: &str,
    engine: &str,
) -> Result<(), String> {
    if let Some(parent) = immunity_db.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("immunity_db mkdir: {e}"))?;
    }
    let mut db = load_immunity_db(immunity_db);
    if db.version == 0 {
        db.version = 1;
    }
    if !known_antigen(&db, &digest) {
        db.antigens.push(Antigen {
            sha256: digest,
            synthesized_at: unix_secs(),
            source_path: source_path.to_string(),
            engine: engine.to_string(),
        });
    }
    let json = serde_json::to_string_pretty(&db).map_err(|e| e.to_string())?;
    fs::write(immunity_db, json).map_err(|e| format!("immunity_db write: {e}"))
}

fn restore_clean_state(target: &Path, source: &Path) -> Result<(), String> {
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("restore mkdir: {e}"))?;
    }
    fs::copy(source, target).map_err(|e| format!("restore copy: {e}"))?;
    Ok(())
}

pub fn remediate(req: RemediateRequest<'_>) -> RepairOutcome {
    let shown = display_path(req.target, req.redact_paths);

    if let Err(err) = assert_not_sanctuary(req.target) {
        return RepairOutcome::SanctuaryAbort {
            path: shown,
            message: err,
        };
    }

    if !req.auto_repair && !req.confirmed {
        return RepairOutcome::AwaitingConfirmation {
            path: shown,
            message: "Amoeba held. Antigen is staged; confirm phagocytosis to restore clean state."
                .to_string(),
        };
    }

    let antigen_sha256 = match sha256_file(req.target) {
        Ok(digest) => digest,
        Err(message) => {
            return RepairOutcome::Failed {
                path: shown,
                message,
            };
        }
    };

    let Some(shadow) = volume_shadow_candidate(req.target) else {
        return RepairOutcome::Failed {
            path: shown,
            message: "No localized backup reference or Volume Shadow Copy is available.".to_string(),
        };
    };

    if let Err(message) = restore_clean_state(req.target, &shadow) {
        return RepairOutcome::Failed {
            path: shown,
            message,
        };
    }

    let immunity_source = if req.redact_paths {
        shown.clone()
    } else {
        req.target.to_string_lossy().into_owned()
    };

    if let Err(message) = present_antigen(
        req.immunity_db,
        antigen_sha256.clone(),
        &immunity_source,
        req.engine_tag,
    ) {
        return RepairOutcome::Failed {
            path: shown,
            message,
        };
    }

    RepairOutcome::Repaired {
        path: shown,
        message: "Amoeba completed phagocytosis and restored the host from shadow stock.".to_string(),
        antigen_sha256,
    }
}

fn write_if_missing(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if path.exists() {
        return Ok(());
    }
    fs::write(path, bytes).map_err(|e| e.to_string())
}

/// Creates the demo lab if needed, but never re-infects a host file that
/// Amoeba has already restored (or that the operator has otherwise replaced).
pub fn ensure_demo_lab(data_dir: &Path) -> Result<PathBuf, String> {
    let lab = data_dir.join("scan_lab");
    fs::create_dir_all(lab.join(".amoeba_shadow")).map_err(|e| e.to_string())?;
    fs::create_dir_all(lab.join("Music")).map_err(|e| e.to_string())?;
    fs::create_dir_all(lab.join("Studio-Projects")).map_err(|e| e.to_string())?;

    write_if_missing(&lab.join("ok.txt"), b"nominal chassis telemetry\n")?;
    write_if_missing(
        &lab.join(".amoeba_shadow").join("tainted.txt"),
        b"sterile payload restored by amoeba\n",
    )?;
    write_if_missing(
        &lab.join("tainted.txt"),
        format!("demo {}\n", crate::samurai_engine::SELFTEST_ANTIGEN).as_bytes(),
    )?;
    write_if_missing(&lab.join("Music").join("session.wav"), b"RIFFDEMO")?;
    write_if_missing(
        &lab.join("neomark-holdings.txt"),
        b"protected corporate sector\n",
    )?;
    write_if_missing(&lab.join("retroblazed-mix.wav"), b"RIFFDEMO")?;
    write_if_missing(&lab.join("Studio-Projects").join("track.aiff"), b"FORMDEMO")?;
    Ok(lab)
}

/// Explicit reset used at boot: always replants the harmless self-test antigen.
pub fn seed_demo_lab(data_dir: &Path) -> Result<PathBuf, String> {
    let lab = ensure_demo_lab(data_dir)?;
    fs::write(
        lab.join("tainted.txt"),
        format!("demo {}\n", crate::samurai_engine::SELFTEST_ANTIGEN).as_bytes(),
    )
    .map_err(|e| e.to_string())?;
    Ok(lab)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sanctuary::ERR_SANCTUARY_ZONE;
    use std::fs;
    use std::path::PathBuf;

    fn unique_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "samurai-amoeba-{}-{}",
            label,
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn sanctuary_aborts_before_touching_files() {
        let root = unique_dir("sanct");
        let target = root.join("Music").join("vocal.wav");
        fs::create_dir_all(target.parent().unwrap()).unwrap();
        fs::write(&target, b"do-not-touch").unwrap();
        let db = root.join("immunity_db.json");

        let outcome = remediate(RemediateRequest {
            target: &target,
            auto_repair: true,
            confirmed: true,
            immunity_db: &db,
            engine_tag: "test",
            redact_paths: false,
        });

        match outcome {
            RepairOutcome::SanctuaryAbort { message, .. } => {
                assert_eq!(message, ERR_SANCTUARY_ZONE);
            }
            other => panic!("expected sanctuary abort, got {other:?}"),
        }
        assert_eq!(fs::read(&target).unwrap(), b"do-not-touch");
        assert!(!db.exists());
    }

    #[test]
    fn manual_mode_awaits_confirmation() {
        let root = unique_dir("manual");
        let target = root.join("tainted.txt");
        fs::write(&target, b"antigen").unwrap();
        let db = root.join("immunity_db.json");

        let outcome = remediate(RemediateRequest {
            target: &target,
            auto_repair: false,
            confirmed: false,
            immunity_db: &db,
            engine_tag: "test",
            redact_paths: false,
        });

        assert!(matches!(outcome, RepairOutcome::AwaitingConfirmation { .. }));
        assert_eq!(fs::read(&target).unwrap(), b"antigen");
    }

    #[test]
    fn auto_repair_restores_from_shadow_and_presents_antigen() {
        let root = unique_dir("auto");
        let target = root.join("tainted.txt");
        fs::create_dir_all(root.join(".amoeba_shadow")).unwrap();
        fs::write(&target, b"dirty-antigen").unwrap();
        fs::write(root.join(".amoeba_shadow").join("tainted.txt"), b"clean").unwrap();
        let db = root.join("immunity_db.json");

        let outcome = remediate(RemediateRequest {
            target: &target,
            auto_repair: true,
            confirmed: false,
            immunity_db: &db,
            engine_tag: "heuristic",
            redact_paths: false,
        });

        match outcome {
            RepairOutcome::Repaired { antigen_sha256, .. } => {
                assert_eq!(antigen_sha256, sha256_bytes(b"dirty-antigen"));
            }
            other => panic!("expected repaired, got {other:?}"),
        }
        assert_eq!(fs::read(&target).unwrap(), b"clean");
        let stored = load_immunity_db(&db);
        assert_eq!(stored.antigens.len(), 1);
        assert_eq!(stored.antigens[0].engine, "heuristic");
    }

    #[test]
    fn ensure_demo_lab_does_not_revive_restored_host() {
        let root = unique_dir("ensure");
        let lab = seed_demo_lab(&root).unwrap();
        fs::write(lab.join("tainted.txt"), b"already-restored\n").unwrap();
        ensure_demo_lab(&root).unwrap();
        assert_eq!(
            fs::read_to_string(lab.join("tainted.txt")).unwrap(),
            "already-restored\n"
        );
    }

    #[test]
    fn seed_demo_lab_replants_selftest_antigen() {
        let root = unique_dir("reseed");
        let lab = seed_demo_lab(&root).unwrap();
        fs::write(lab.join("tainted.txt"), b"already-restored\n").unwrap();
        seed_demo_lab(&root).unwrap();
        assert!(
            fs::read_to_string(lab.join("tainted.txt"))
                .unwrap()
                .contains("SAMURAI-AMOEBA-ANTIGEN-SELFTEST")
        );
    }
}
