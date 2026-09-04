//! Samurai eradication engine — defensive scanners only.
//!
//! Invokes local CLI tools (`yara`, `clamscan`, `tshark`) when present, parses
//! their output, and reduces it to a Threat Score (0–100) plus one sentence.
//! Raw terminal dumps never reach the UI.

use crate::amoeba_engine::{
    create_restore_point, ensure_demo_lab, known_antigen, load_immunity_db, remediate,
    RepairOutcome, RemediateRequest,
};
use crate::sanctuary::{is_sanctuary, ERR_SANCTUARY_ZONE};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Harmless self-test marker used by the heuristic / YARA demo rule.
pub const SELFTEST_ANTIGEN: &str = "SAMURAI-AMOEBA-ANTIGEN-SELFTEST";

const YARA_RULE: &str = r#"
rule Samurai_Selftest_Antigen
{
    meta:
        description = "Harmless Samurai EDR self-test antigen"
        author = "Ronin Softworx"
    strings:
        $a = "SAMURAI-AMOEBA-ANTIGEN-SELFTEST"
    condition:
        $a
}

rule Samurai_Ransom_Note_Text
{
    meta:
        description = "Generic ransomware note phrases"
        author = "Ronin Softworx"
    strings:
        $a = "your files have been encrypted" nocase
        $b = "decrypt your files" nocase
        $c = "send bitcoin" nocase
        $d = "tor browser" nocase
    condition:
        2 of them
}
"#;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ThreatBand {
    Nominal,
    Caution,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Finding {
    pub engine: String,
    pub detail: String,
    pub path: Option<String>,
    pub severity: Severity,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineStatus {
    pub name: String,
    pub available: bool,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanReport {
    pub threat_score: u8,
    pub synthesis: String,
    pub band: ThreatBand,
    pub findings: Vec<Finding>,
    pub engine_statuses: Vec<EngineStatus>,
    pub auto_actions: Vec<RepairOutcome>,
    pub streamer_mode: bool,
    pub scanned_files: u32,
    pub lab_path: Option<String>,
    #[serde(default)]
    pub intercepts: Vec<crate::install_gate::Intercept>,
}

pub fn band_from_score(score: u8) -> ThreatBand {
    match score {
        0..=30 => ThreatBand::Nominal,
        31..=70 => ThreatBand::Caution,
        _ => ThreatBand::Critical,
    }
}

pub fn compute_threat_score(findings: &[Finding]) -> u8 {
    let mut score: i32 = 0;
    for finding in findings {
        score += match finding.severity {
            Severity::Low => 8,
            Severity::Medium => 18,
            Severity::High => 32,
            Severity::Critical => 48,
        };
    }
    score.clamp(0, 100) as u8
}

pub fn synthesize(
    score: u8,
    findings: usize,
    repaired: usize,
    awaiting: usize,
    aborted: usize,
    streamer: bool,
) -> String {
    if aborted > 0 {
        let core =
            "Sanctuary sector locked; Samurai will not rewrite, quarantine, or restore inside the creations vault.";
        return if streamer {
            format!(
                "{}, with streamer shield masking path readout.",
                core.trim_end_matches('.')
            )
        } else {
            core.to_string()
        };
    }
    let core = match (score, findings, repaired, awaiting) {
        (0..=5, 0, _, _) => {
            "Chassis is sterile; Samurai reports no antigenic residue on this sweep."
        }
        (0..=30, _, _, _) => {
            "Low-grade noise only; the silver line holds and no phagocytosis is required."
        }
        (_, _, n, _) if n > 0 && score <= 70 => {
            "Amoeba ingested the anomaly and restored the host file from localized shadow stock."
        }
        (_, _, n, _) if n > 0 => {
            "Critical signatures were cut down; Amoeba sealed the wound from shadow copies."
        }
        (_, _, _, n) if n > 0 => {
            "Caution band: antigen traces are staged and Amoeba awaits explicit confirmation."
        }
        (31..=70, _, _, _) => {
            "Caution band: antigen traces are present and awaiting macrophage action."
        }
        _ => "Critical incursion on the blood-red band; confirm phagocytosis to restore clean state.",
    };
    if streamer {
        let trimmed = core.trim_end_matches('.');
        format!("{trimmed}, with streamer shield masking path readout.")
    } else {
        core.to_string()
    }
}

fn redact_path(path: &str, streamer: bool) -> String {
    if !streamer {
        return path.to_string();
    }
    Path::new(path)
        .file_name()
        .map(|n| format!("[STREAM-SHIELD]/{}", n.to_string_lossy()))
        .unwrap_or_else(|| "[STREAM-SHIELD]".into())
}

fn collect_files(root: &Path, max_files: usize) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if root.is_file() {
        out.push(root.to_path_buf());
        return out;
    }
    let mut stack = vec![(root.to_path_buf(), 0u8)];
    while let Some((dir, depth)) = stack.pop() {
        if out.len() >= max_files || depth > 6 {
            continue;
        }
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().into_owned();
            if name == ".amoeba_shadow" || name == "quarantine" || name == "immunity_db.json" {
                continue;
            }
            if path.is_dir() {
                stack.push((path, depth.saturating_add(1)));
            } else if path.is_file() {
                out.push(path);
                if out.len() >= max_files {
                    break;
                }
            }
        }
    }
    out
}

fn heuristic_scan(files: &[PathBuf], immunity: &Path, streamer: bool) -> Vec<Finding> {
    let db = load_immunity_db(immunity);
    let mut findings = Vec::new();
    for path in files {
        let Ok(bytes) = fs::read(path) else {
            continue;
        };
        if bytes.len() > 512_000 {
            continue;
        }
        let shown = redact_path(&path.to_string_lossy(), streamer);
        let digest = crate::amoeba_engine::sha256_bytes(&bytes);
        if known_antigen(&db, &digest) {
            findings.push(Finding {
                engine: "heuristic".into(),
                detail: "Known antigen hash matched local immunity_db.json.".into(),
                path: Some(shown.clone()),
                severity: Severity::High,
            });
        }
        if bytes
            .windows(SELFTEST_ANTIGEN.len())
            .any(|w| w == SELFTEST_ANTIGEN.as_bytes())
        {
            findings.push(Finding {
                engine: "heuristic".into(),
                detail: "Self-test antigen string located in host file.".into(),
                path: Some(shown),
                severity: Severity::Critical,
            });
        }
    }
    findings
}

fn run_yara(
    target: &Path,
    data_dir: &Path,
    streamer: bool,
    tools_dir: &Path,
) -> (EngineStatus, Vec<Finding>) {
    let Some(bin) = resolve_tool("yara", tools_dir) else {
        return (
            EngineStatus {
                name: "yara".into(),
                available: false,
                summary: "YARA is not bundled and not present on PATH.".into(),
            },
            Vec::new(),
        );
    };
    let rule_path = data_dir.join("samurai_selftest.yar");
    if fs::write(&rule_path, YARA_RULE).is_err() {
        return (
            EngineStatus {
                name: "yara".into(),
                available: true,
                summary: "Unable to stage self-test rule file.".into(),
            },
            Vec::new(),
        );
    }
    let output = command_for_tool(&bin)
        .arg("-r")
        .arg(&rule_path)
        .arg(target)
        .output();
    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let mut findings = Vec::new();
            for line in stdout.lines() {
                let line = line.trim();
                if line.is_empty() {
                    continue;
                }
                let mut parts = line.splitn(2, char::is_whitespace);
                let rule = parts.next().unwrap_or("yara");
                let hit_path = parts.next().unwrap_or("").trim();
                findings.push(Finding {
                    engine: "yara".into(),
                    detail: format!("Rule {rule} matched."),
                    path: if hit_path.is_empty() {
                        None
                    } else {
                        Some(redact_path(hit_path, streamer))
                    },
                    severity: Severity::High,
                });
            }
            (
                EngineStatus {
                    name: "yara".into(),
                    available: true,
                    summary: format!("{} rule hit(s) parsed.", findings.len()),
                },
                findings,
            )
        }
        Err(_) => (
            EngineStatus {
                name: "yara".into(),
                available: false,
                summary: "YARA invocation failed.".into(),
            },
            Vec::new(),
        ),
    }
}

fn run_clamav(target: &Path, streamer: bool, tools_dir: &Path) -> (EngineStatus, Vec<Finding>) {
    let Some(bin) = resolve_tool("clamscan", tools_dir) else {
        return (
            EngineStatus {
                name: "clamav".into(),
                available: false,
                summary: "ClamAV is not bundled and not present on PATH.".into(),
            },
            Vec::new(),
        );
    };
    let mut cmd = command_for_tool(&bin);
    cmd.args(["-i", "--no-summary", "--max-filesize=8M", "--max-scansize=16M"]);
    let database = tools_dir.join("database");
    if database.is_dir() {
        cmd.arg("--database").arg(&database);
    }
    let output = cmd.arg(target).output();
    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let mut findings = Vec::new();
            for line in stdout.lines() {
                if let Some(idx) = line.rfind(" FOUND") {
                    let head = &line[..idx];
                    let (hit_path, sig) = match head.rsplit_once(':') {
                        Some((p, s)) => (p.trim(), s.trim()),
                        None => (head.trim(), "clamav"),
                    };
                    findings.push(Finding {
                        engine: "clamav".into(),
                        detail: format!("Signature {sig}."),
                        path: Some(redact_path(hit_path, streamer)),
                        severity: Severity::Critical,
                    });
                }
            }
            (
                EngineStatus {
                    name: "clamav".into(),
                    available: true,
                    summary: format!("{} detection(s) parsed.", findings.len()),
                },
                findings,
            )
        }
        Err(_) => (
            EngineStatus {
                name: "clamav".into(),
                available: false,
                summary: "clamscan invocation failed.".into(),
            },
            Vec::new(),
        ),
    }
}

fn run_tshark(streamer: bool, tools_dir: &Path) -> (EngineStatus, Vec<Finding>) {
    let bundled = resolve_tool("tshark", tools_dir);
    if streamer {
        return (
            EngineStatus {
                name: "tshark".into(),
                available: bundled.is_some(),
                summary: "Streamer shield suppressed packet telemetry.".into(),
            },
            Vec::new(),
        );
    }
    let Some(bin) = bundled else {
        return (
            EngineStatus {
                name: "tshark".into(),
                available: false,
                summary: "tshark is not installed (packet capture is optional).".into(),
            },
            Vec::new(),
        );
    };
    // Protocol names only — never dump payloads or apply user-supplied capture filters.
    let output = command_for_tool(&bin)
        .args([
            "-c",
            "12",
            "-a",
            "duration:3",
            "-T",
            "fields",
            "-e",
            "frame.protocols",
        ])
        .output();
    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let protocols: Vec<&str> = stdout
                .lines()
                .map(str::trim)
                .filter(|l| !l.is_empty())
                .collect();
            let unusual = protocols
                .iter()
                .filter(|p| p.contains("data") && p.split(':').count() > 4)
                .count();
            let mut findings = Vec::new();
            if unusual >= 8 {
                findings.push(Finding {
                    engine: "tshark".into(),
                    detail: "Dense unstructured protocol burst on local capture.".into(),
                    path: None,
                    severity: Severity::Low,
                });
            }
            (
                EngineStatus {
                    name: "tshark".into(),
                    available: true,
                    summary: format!("{} protocol frames sampled.", protocols.len()),
                },
                findings,
            )
        }
        Err(_) => (
            EngineStatus {
                name: "tshark".into(),
                available: false,
                summary: "tshark invocation failed or lacked capture privilege.".into(),
            },
            Vec::new(),
        ),
    }
}

fn which_exists(bin: &str) -> bool {
    let probe = if cfg!(windows) { "where" } else { "which" };
    Command::new(probe)
        .arg(bin)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

pub fn resolve_tool(name: &str, tools_dir: &Path) -> Option<PathBuf> {
    let file_name = if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_string()
    };
    let mut candidates = Vec::new();
    if !tools_dir.as_os_str().is_empty() {
        candidates.push(tools_dir.join(&file_name));
        candidates.push(tools_dir.join(name));
        candidates.push(tools_dir.join("bin").join(&file_name));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join(&file_name));
            candidates.push(dir.join("engines").join(&file_name));
            if let Some(contents) = dir.parent() {
                candidates.push(
                    contents
                        .join("Resources")
                        .join("engines")
                        .join(&file_name),
                );
            }
        }
    }
    for path in candidates {
        if path.is_file() {
            return Some(path);
        }
    }
    if which_exists(name) {
        Some(PathBuf::from(name))
    } else {
        None
    }
}

fn command_for_tool(bin: &Path) -> Command {
    let mut cmd = Command::new(bin);
    if let Some(dir) = bin.parent() {
        let sep = if cfg!(windows) { ";" } else { ":" };
        let mut path_value = dir.to_string_lossy().into_owned();
        if let Ok(existing) = std::env::var("PATH") {
            path_value = format!("{path_value}{sep}{existing}");
        }
        cmd.env("PATH", path_value);
        if cfg!(unix) {
            let mut loader = dir.to_string_lossy().into_owned();
            if let Ok(existing) = std::env::var("LD_LIBRARY_PATH") {
                loader = format!("{loader}:{existing}");
            }
            cmd.env("LD_LIBRARY_PATH", &loader);
            cmd.env("DYLD_LIBRARY_PATH", loader);
        }
    }
    cmd
}

fn should_remediate(finding: &Finding) -> bool {
    match finding.engine.as_str() {
        "heuristic" => {
            finding.detail.contains("Self-test antigen")
                || finding.detail.contains("Known antigen hash")
        }
        "yara" | "clamav" => true,
        _ => false,
    }
}

fn file_has_finding(path: &Path, findings: &[Finding]) -> bool {
    findings.iter().any(|finding| {
        finding.path.as_ref().is_some_and(|shown| {
            shown == &path.to_string_lossy()
                || path
                    .file_name()
                    .is_some_and(|name| shown.ends_with(&*name.to_string_lossy()))
        })
    })
}

fn snapshot_clean_hosts(files: &[PathBuf], findings: &[Finding]) {
    for path in files {
        if file_has_finding(path, findings) {
            continue;
        }
        let _ = create_restore_point(path);
    }
}

fn unique_finding_paths(findings: &[Finding]) -> Vec<String> {
    let mut paths = Vec::new();
    for finding in findings {
        if let Some(path) = &finding.path {
            if !path.starts_with("[STREAM-SHIELD]") && !paths.iter().any(|p| p == path) {
                paths.push(path.clone());
            }
        }
    }
    paths
}

pub fn run_scan(
    target_path: Option<String>,
    streamer_mode: bool,
    auto_repair: bool,
    data_dir: &Path,
    immunity_db: &Path,
    tools_dir: &Path,
    hold_root: Option<&Path>,
) -> Result<ScanReport, String> {
    fs::create_dir_all(data_dir).map_err(|e| e.to_string())?;
    let lab = ensure_demo_lab(data_dir)?;
    let target = match target_path {
        Some(p) if !p.trim().is_empty() => PathBuf::from(p.trim()),
        _ => lab.clone(),
    };
    if !target.exists() {
        return Err(format!(
            "Scan target does not exist: {}",
            target.to_string_lossy()
        ));
    }

    let files = collect_files(&target, 400);
    let mut findings = heuristic_scan(&files, immunity_db, streamer_mode);
    let foothold_hits = crate::foothold::hunt_scan_files(&files, streamer_mode);
    let host_hits = crate::foothold::hunt_host_persistence(streamer_mode);
    let foothold_count = foothold_hits.len() + host_hits.len();
    findings.extend(foothold_hits);
    findings.extend(host_hits);

    let mut statuses = vec![
        EngineStatus {
            name: "heuristic".into(),
            available: true,
            summary: format!("Inspected {} file(s).", files.len()),
        },
        EngineStatus {
            name: "foothold".into(),
            available: true,
            summary: if foothold_count == 0 {
                "Creator-threat hunt: disguised payloads, ransom notes, hostile autostart.".into()
            } else {
                format!("{foothold_count} creator-threat or persistence hit(s).")
            },
        },
    ];

    let (yara_status, yara_hits) = run_yara(&target, data_dir, streamer_mode, tools_dir);
    statuses.push(yara_status);
    findings.extend(yara_hits);

    let (clam_status, clam_hits) = run_clamav(&target, streamer_mode, tools_dir);
    statuses.push(clam_status);
    findings.extend(clam_hits);

    let (tshark_status, tshark_hits) = run_tshark(streamer_mode, tools_dir);
    statuses.push(tshark_status);
    findings.extend(tshark_hits);

    snapshot_clean_hosts(&files, &findings);

    let remediable: Vec<&Finding> = findings.iter().filter(|f| should_remediate(f)).collect();
    let mut auto_actions = Vec::new();
    if is_sanctuary(&target) {
        auto_actions.push(RepairOutcome::SanctuaryAbort {
            path: redact_path(&target.to_string_lossy(), streamer_mode),
            message: ERR_SANCTUARY_ZONE.to_string(),
        });
    } else if !remediable.is_empty() {
        // Repair uses real paths. When streamer mode redacted them, resolve via lab files.
        let candidates: Vec<PathBuf> = if streamer_mode {
            files
                .iter()
                .filter(|p| {
                    remediable.iter().any(|f| {
                        f.path.as_ref().is_some_and(|shown| {
                            p.file_name()
                                .map(|n| shown.ends_with(&*n.to_string_lossy()))
                                .unwrap_or(false)
                        })
                    })
                })
                .cloned()
                .collect()
        } else {
            unique_finding_paths(&findings.iter().filter(|f| should_remediate(f)).cloned().collect::<Vec<_>>())
            .into_iter()
            .map(PathBuf::from)
            .collect()
        };

        for path in candidates {
            let engine_tag = remediable
                .iter()
                .find(|f| {
                    f.path.as_ref().is_some_and(|p| {
                        p == &path.to_string_lossy()
                            || path
                                .file_name()
                                .is_some_and(|n| p.ends_with(&*n.to_string_lossy()))
                    })
                })
                .map(|f| f.engine.as_str())
                .unwrap_or("heuristic");
            auto_actions.push(remediate(RemediateRequest {
                target: &path,
                auto_repair,
                confirmed: false,
                immunity_db,
                engine_tag,
                redact_paths: streamer_mode,
            }));
        }
    }

    let repaired = auto_actions
        .iter()
        .filter(|a| matches!(a, RepairOutcome::Repaired { .. }))
        .count();
    let awaiting = auto_actions
        .iter()
        .filter(|a| matches!(a, RepairOutcome::AwaitingConfirmation { .. }))
        .count();
    let aborted = auto_actions
        .iter()
        .filter(|a| matches!(a, RepairOutcome::SanctuaryAbort { .. }))
        .count();

    let mut score = compute_threat_score(&findings);
    if aborted > 0 && findings.is_empty() {
        score = 0;
    } else if repaired > 0 && awaiting == 0 {
        score = score.saturating_sub(40).max(8);
    }

    let foothold_only = !findings.is_empty()
        && findings.iter().all(|finding| finding.engine == "foothold")
        && repaired == 0
        && awaiting == 0
        && aborted == 0;

    let intercepts = if let Some(root) = hold_root {
        crate::install_gate::hold_scan_files(&files, root, streamer_mode)
    } else {
        Vec::new()
    };
    let held = intercepts.iter().filter(|item| item.kind == "held").count();
    statuses.push(EngineStatus {
        name: "gate".into(),
        available: hold_root.is_some(),
        summary: if held == 0 {
            if hold_root.is_some() {
                "Install gate armed: crack/keygen/RAT drops are held on write. Nested archives are inspected.".into()
            } else {
                "Install gate standby.".into()
            }
        } else {
            format!("{held} drop(s) moved to the install-gate vault.")
        },
    });

    let synthesis = if held > 0 {
        let core = "Install gate held a high-risk drop before it could run. Creations were not rewritten.";
        if streamer_mode {
            format!(
                "{}, with streamer shield masking path readout.",
                core.trim_end_matches('.')
            )
        } else {
            core.to_string()
        }
    } else if foothold_only {
        let core = "Foothold hunt flagged a creator-targeted drop. Inspect the table; Samurai will not rewrite sanctuary.";
        if streamer_mode {
            format!(
                "{}, with streamer shield masking path readout.",
                core.trim_end_matches('.')
            )
        } else {
            core.to_string()
        }
    } else {
        synthesize(
            score,
            findings.len(),
            repaired,
            awaiting,
            aborted,
            streamer_mode,
        )
    };

    Ok(ScanReport {
        threat_score: score,
        synthesis,
        band: band_from_score(score),
        findings,
        engine_statuses: statuses,
        auto_actions,
        streamer_mode,
        scanned_files: files.len() as u32,
        lab_path: Some(lab.to_string_lossy().into_owned()),
        intercepts,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::amoeba_engine::RepairOutcome;
    use crate::sanctuary::ERR_SANCTUARY_ZONE;
    use std::fs;
    use std::path::PathBuf;

    #[test]
    fn empty_findings_are_nominal_zero() {
        assert_eq!(compute_threat_score(&[]), 0);
        assert_eq!(band_from_score(0), ThreatBand::Nominal);
        assert_eq!(band_from_score(31), ThreatBand::Caution);
        assert_eq!(band_from_score(71), ThreatBand::Critical);
    }

    #[test]
    fn score_clamps_at_one_hundred() {
        let findings = vec![
            Finding {
                engine: "t".into(),
                detail: "a".into(),
                path: None,
                severity: Severity::Critical,
            },
            Finding {
                engine: "t".into(),
                detail: "b".into(),
                path: None,
                severity: Severity::Critical,
            },
            Finding {
                engine: "t".into(),
                detail: "c".into(),
                path: None,
                severity: Severity::Critical,
            },
        ];
        assert_eq!(compute_threat_score(&findings), 100);
    }

    #[test]
    fn synthesis_is_a_single_core_sentence_without_streamer() {
        let text = synthesize(0, 0, 0, 0, 0, false);
        assert!(!text.contains('\n'));
        assert!(text.contains("sterile"));
    }

    #[test]
    fn synthesis_locks_when_sanctuary_aborts() {
        let text = synthesize(78, 2, 0, 0, 1, false);
        assert!(text.contains("Sanctuary sector locked"));
        assert!(!text.contains("incursion"));
    }

    fn temp_lab(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "samurai-scan-{}-{}-{}",
            label,
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn second_scan_stays_clean_after_auto_repair() {
        let root = temp_lab("clean-second");
        let immunity = root.join("immunity_db.json");
        let first = run_scan(None, false, true, &root, &immunity, &root.join("engines"), None).expect("first scan");
        assert!(
            first
                .auto_actions
                .iter()
                .any(|action| matches!(action, RepairOutcome::Repaired { .. })),
            "first scan should auto-repair, got {:?}",
            first.auto_actions
        );
        let host = fs::read_to_string(root.join("scan_lab").join("tainted.txt")).unwrap();
        assert!(
            !host.contains(SELFTEST_ANTIGEN),
            "host still dirty after auto-repair: {host}"
        );

        let second = run_scan(None, false, true, &root, &immunity, &root.join("engines"), None).expect("second scan");
        assert!(
            second
                .findings
                .iter()
                .all(|finding| !finding.detail.contains("Self-test antigen")),
            "second scan re-detected the antigen: {:?}",
            second.findings
        );
        assert!(
            second.auto_actions.is_empty(),
            "second scan should not remediate: {:?}",
            second.auto_actions
        );
        assert!(second.threat_score <= 30);
        assert_eq!(
            fs::read(root.join("scan_lab").join(".amoeba_shadow").join("ok.txt")).unwrap(),
            b"nominal chassis telemetry\n"
        );
    }

    #[test]
    fn ask_mode_leaves_host_dirty_until_confirmed() {
        let root = temp_lab("ask");
        let immunity = root.join("immunity_db.json");
        let report = run_scan(None, false, false, &root, &immunity, &root.join("engines"), None).expect("ask scan");
        assert!(
            report
                .auto_actions
                .iter()
                .any(|action| matches!(action, RepairOutcome::AwaitingConfirmation { .. })),
            "expected awaiting confirmation, got {:?}",
            report.auto_actions
        );
        let host = fs::read_to_string(root.join("scan_lab").join("tainted.txt")).unwrap();
        assert!(host.contains(SELFTEST_ANTIGEN));
        assert!(!immunity.exists());
    }

    #[test]
    fn clean_user_folder_gets_restore_points_infected_host_does_not() {
        let root = temp_lab("user-folder");
        let folder = root.join("Downloads");
        fs::create_dir_all(folder.join(".amoeba_shadow")).unwrap();
        fs::write(folder.join("invoice.pdf"), b"%PDF-clean").unwrap();
        fs::write(
            folder.join("tainted.txt"),
            format!("x {SELFTEST_ANTIGEN}\n").as_bytes(),
        )
        .unwrap();
        fs::write(
            folder.join(".amoeba_shadow").join("tainted.txt"),
            b"prior-clean",
        )
        .unwrap();
        let immunity = root.join("immunity_db.json");
        run_scan(
            Some(folder.to_string_lossy().into_owned()),
            false,
            false,
            &root,
            &immunity,
            &root.join("engines"),
            None,
        )
        .expect("user folder scan");
        assert_eq!(
            fs::read(folder.join(".amoeba_shadow").join("invoice.pdf")).unwrap(),
            b"%PDF-clean"
        );
        assert_eq!(
            fs::read(folder.join(".amoeba_shadow").join("tainted.txt")).unwrap(),
            b"prior-clean"
        );
    }

    #[test]
    fn sanctuary_target_aborts_and_does_not_touch_files() {
        let root = temp_lab("scan-music");
        let music_dir = root.join("Music");
        fs::create_dir_all(&music_dir).unwrap();
        let vocal = music_dir.join("vocal.wav");
        fs::write(&vocal, b"do-not-touch").unwrap();
        let immunity = root.join("immunity_db.json");
        let report = run_scan(
            Some(music_dir.to_string_lossy().into_owned()),
            false,
            true,
            &root,
            &immunity,
            &root.join("engines"),
            None,
        )
        .expect("sanctuary scan");
        assert!(
            report.auto_actions.iter().any(|action| matches!(
                action,
                RepairOutcome::SanctuaryAbort { message, .. } if message == ERR_SANCTUARY_ZONE
            )),
            "expected sanctuary abort, got {:?}",
            report.auto_actions
        );
        assert_eq!(fs::read(&vocal).unwrap(), b"do-not-touch");
        assert!(!music_dir.join(".amoeba_shadow").exists());
        assert!(!immunity.exists());
        assert_eq!(report.threat_score, 0);
        assert!(report.synthesis.contains("Sanctuary sector locked"));
    }

    #[test]
    fn streamer_mode_redacts_paths_and_notes_shield() {
        let root = temp_lab("stream");
        let immunity = root.join("immunity_db.json");
        let report = run_scan(None, true, true, &root, &immunity, &root.join("engines"), None).expect("streamer scan");
        for finding in &report.findings {
            if let Some(path) = &finding.path {
                assert!(
                    path.starts_with("[STREAM-SHIELD]"),
                    "unredacted finding path: {path}"
                );
                assert!(!path.contains("scan_lab"), "lab path leaked: {path}");
            }
        }
        let tshark = report
            .engine_statuses
            .iter()
            .find(|engine| engine.name == "tshark")
            .expect("tshark status");
        assert!(tshark.summary.contains("Streamer shield"));
        assert!(report.synthesis.contains("streamer shield"));
    }

    #[test]
    fn resolve_tool_prefers_bundled_binary() {
        let root = temp_lab("tools");
        let engines = root.join("engines");
        fs::create_dir_all(&engines).unwrap();
        let file_name = if cfg!(windows) { "yara.exe" } else { "yara" };
        let tool = engines.join(file_name);
        fs::write(&tool, b"not-a-real-yara").unwrap();
        let resolved = resolve_tool("yara", &engines).expect("bundled yara");
        assert_eq!(resolved, tool);
        assert!(resolve_tool("definitely-missing-samurai-bin", &engines).is_none());
    }

    #[test]
    fn disguised_wav_is_reported_and_not_rewritten() {
        let root = temp_lab("disguised");
        let folder = root.join("Downloads");
        fs::create_dir_all(&folder).unwrap();
        let bait = folder.join("kick.wav.exe");
        fs::write(&bait, b"MZ-fake-pack").unwrap();
        let immunity = root.join("immunity_db.json");
        let report = run_scan(
            Some(folder.to_string_lossy().into_owned()),
            false,
            true,
            &root,
            &immunity,
            &root.join("engines"),
            None,
        )
        .expect("disguised scan");
        assert!(
            report
                .findings
                .iter()
                .any(|finding| finding.engine == "foothold"
                    && finding.detail.contains("Double-extension")),
            "expected foothold hit, got {:?}",
            report.findings
        );
        assert!(
            report.auto_actions.is_empty(),
            "foothold must not trigger Amoeba rewrite: {:?}",
            report.auto_actions
        );
        assert_eq!(fs::read(&bait).unwrap(), b"MZ-fake-pack");
        assert!(report.synthesis.contains("Foothold hunt"));
        assert!(
            report
                .engine_statuses
                .iter()
                .any(|engine| engine.name == "foothold" && engine.available)
        );
    }

    #[test]
    fn sanctuary_reports_disguised_creation_without_touching_it() {
        let root = temp_lab("music-pe");
        let music = root.join("Music");
        fs::create_dir_all(&music).unwrap();
        let vocal = music.join("vocal.wav");
        fs::write(&vocal, b"MZ\x90\x00not-a-riff").unwrap();
        let immunity = root.join("immunity_db.json");
        let report = run_scan(
            Some(music.to_string_lossy().into_owned()),
            false,
            true,
            &root,
            &immunity,
            &root.join("engines"),
            None,
        )
        .expect("sanctuary disguised scan");
        assert!(
            report.auto_actions.iter().any(|action| matches!(
                action,
                RepairOutcome::SanctuaryAbort { message, .. } if message == ERR_SANCTUARY_ZONE
            )),
            "expected sanctuary abort, got {:?}",
            report.auto_actions
        );
        assert!(
            report
                .findings
                .iter()
                .any(|finding| finding.engine == "foothold"
                    && finding.detail.contains("disguised")),
            "expected disguised-creation finding, got {:?}",
            report.findings
        );
        assert_eq!(fs::read(&vocal).unwrap(), b"MZ\x90\x00not-a-riff");
        assert!(!music.join(".amoeba_shadow").exists());
    }

    #[test]
    fn install_gate_holds_crack_drop_outside_sanctuary() {
        let root = temp_lab("gate-crack");
        let folder = root.join("Downloads");
        let vault = root.join("install_gate");
        fs::create_dir_all(&folder).unwrap();
        let bait = folder.join("FLStudio-crack.exe");
        fs::write(&bait, b"MZ-warez-loader").unwrap();
        let immunity = root.join("immunity_db.json");
        let report = run_scan(
            Some(folder.to_string_lossy().into_owned()),
            false,
            true,
            &root,
            &immunity,
            &root.join("engines"),
            Some(&vault),
        )
        .expect("gate scan");
        assert!(
            report.intercepts.iter().any(|item| item.kind == "held"),
            "expected a held intercept, got {:?}",
            report.intercepts
        );
        assert!(!bait.exists(), "crack drop should have been moved");
        assert!(report.synthesis.contains("Install gate held"));
        assert!(
            report.auto_actions.is_empty(),
            "install gate must not Amoeba-rewrite the bait: {:?}",
            report.auto_actions
        );
    }

    #[test]
    fn install_gate_holds_zip_with_inner_keygen() {
        let root = temp_lab("gate-zip");
        let folder = root.join("Downloads");
        let vault = root.join("install_gate");
        fs::create_dir_all(&folder).unwrap();
        let bait = folder.join("Ableton_Live_12.zip");
        fs::write(
            &bait,
            crate::archive::store_zip(&[
                ("Ableton Live 12/Setup.exe", b"MZ-setup"),
                ("Ableton Live 12/keygen.exe", b"MZ-loader"),
            ]),
        )
        .unwrap();
        let immunity = root.join("immunity_db.json");
        let report = run_scan(
            Some(folder.to_string_lossy().into_owned()),
            false,
            true,
            &root,
            &immunity,
            &root.join("engines"),
            Some(&vault),
        )
        .expect("nested zip scan");
        assert!(
            report.intercepts.iter().any(|item| item.kind == "held"),
            "expected nested zip hold, got {:?}",
            report.intercepts
        );
        assert!(!bait.exists(), "zip with inner keygen should have been moved");
        assert!(report.synthesis.contains("Install gate held"));
    }
}
