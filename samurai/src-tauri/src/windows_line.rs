//! Windows Defender coexistence — Samurai folders only.
//!
//! Defender stays armed. Samurai asks it to skip the program folder, engine
//! binaries, and the install-gate vault so the two scanners do not deadlock
//! over a held drop. Downloads, Desktop, and sanctuary are never excluded,
//! and real-time protection is never turned off.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

const IDENT: &str = "com.roninsoftworx.samurai";
const ALLOWED_PROCESS: &[&str] = &[
    "samurai.exe",
    "yara.exe",
    "clamscan.exe",
    "freshclam.exe",
];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WindowsLineStatus {
    pub host: String,
    pub defender_realtime: Option<bool>,
    pub exclusions_aligned: bool,
    pub paths: Vec<String>,
    pub processes: Vec<String>,
    pub summary: String,
}

fn normalize(path: &str) -> String {
    path.replace('/', "\\").to_lowercase().trim_end_matches('\\').to_string()
}

pub fn is_forbidden_exclusion_path(path: &str) -> bool {
    let n = normalize(path);
    if n.len() < 8 {
        return true;
    }
    if n == "c:" || n == "c:\\" || n == "c:\\program files" || n == "c:\\program files (x86)" {
        return true;
    }
    let banned = [
        "\\downloads",
        "\\desktop",
        "\\music",
        "\\studio-projects",
        "\\documents",
        "\\pictures",
        "\\videos",
    ];
    banned.iter().any(|needle| n.contains(needle))
}

pub fn is_allowed_exclusion_path(path: &str) -> bool {
    if is_forbidden_exclusion_path(path) {
        return false;
    }
    let n = normalize(path);
    n.contains(IDENT)
        || n.ends_with("\\samurai")
        || n.contains("\\samurai\\engines")
        || n.contains("\\ronin softworx\\samurai")
}

pub fn is_allowed_exclusion_process(name: &str) -> bool {
    ALLOWED_PROCESS
        .iter()
        .any(|allowed| allowed.eq_ignore_ascii_case(name.rsplit(['\\', '/']).next().unwrap_or(name)))
}

pub fn is_transient_lock(err: &std::io::Error) -> bool {
    matches!(err.raw_os_error(), Some(5) | Some(32) | Some(33) | Some(1224))
}

pub fn candidate_paths(install_dir: &Path, app_data: &Path) -> Vec<PathBuf> {
    let mut out = vec![
        install_dir.to_path_buf(),
        app_data.to_path_buf(),
        app_data.join("install_gate"),
        install_dir.join("engines"),
    ];
    out.retain(|path| is_allowed_exclusion_path(&path.to_string_lossy()));
    out.sort();
    out.dedup();
    out
}

#[derive(Debug, Deserialize)]
struct MpPreferenceDump {
    #[serde(default, alias = "ExclusionPath", alias = "exclusionPath")]
    exclusion_path: Option<VecOrOne>,
    #[serde(default, alias = "ExclusionProcess", alias = "exclusionProcess")]
    exclusion_process: Option<VecOrOne>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum VecOrOne {
    Many(Vec<String>),
    One(String),
}

impl VecOrOne {
    fn into_vec(self) -> Vec<String> {
        match self {
            VecOrOne::Many(items) => items,
            VecOrOne::One(item) => vec![item],
        }
    }
}

pub fn parse_exclusion_paths(json: &str) -> Vec<String> {
    let Ok(dump) = serde_json::from_str::<MpPreferenceDump>(json) else {
        return Vec::new();
    };
    dump.exclusion_path.map(VecOrOne::into_vec).unwrap_or_default()
}

pub fn parse_exclusion_processes(json: &str) -> Vec<String> {
    let Ok(dump) = serde_json::from_str::<MpPreferenceDump>(json) else {
        return Vec::new();
    };
    dump.exclusion_process.map(VecOrOne::into_vec).unwrap_or_default()
}

pub fn exclusions_cover(wanted: &[PathBuf], listed: &[String]) -> bool {
    if wanted.is_empty() {
        return false;
    }
    wanted.iter().all(|need| {
        let need_n = normalize(&need.to_string_lossy());
        listed.iter().any(|have| {
            let have_n = normalize(have);
            have_n == need_n || need_n.starts_with(&(have_n.clone() + "\\"))
        })
    })
}

pub fn preview_status() -> WindowsLineStatus {
    WindowsLineStatus {
        host: "preview".into(),
        defender_realtime: None,
        exclusions_aligned: false,
        paths: Vec::new(),
        processes: ALLOWED_PROCESS.iter().map(|s| (*s).to_string()).collect(),
        summary: "Windows Defender line is idle on this host. On Windows, ALIGN asks Defender to skip only Samurai folders — never Downloads, never Desktop. Real-time protection stays on.".into(),
    }
}

pub fn status_from_query(
    install_dir: &Path,
    app_data: &Path,
    realtime: Option<bool>,
    listed_paths: &[String],
    listed_procs: &[String],
) -> WindowsLineStatus {
    let wanted = candidate_paths(install_dir, app_data);
    let paths: Vec<String> = wanted
        .iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect();
    let aligned = exclusions_cover(&wanted, listed_paths)
        && ALLOWED_PROCESS.iter().all(|proc| {
            listed_procs
                .iter()
                .any(|have| have.eq_ignore_ascii_case(proc))
        });
    let summary = match (realtime, aligned) {
        (Some(true), true) => {
            "Defender real-time is on. Samurai folders are excluded so the vault is not a deadlock. Downloads stay scanned.".into()
        }
        (Some(true), false) => {
            "Defender real-time is on and may fight the hold vault. ALIGN asks it to skip Samurai folders only — not Downloads.".into()
        }
        (Some(false), _) => {
            "Defender real-time is off on this PC. Samurai will not turn it off, and will not turn it back on for you — enable it in Windows Security.".into()
        }
        (None, _) => {
            "Could not read Windows Defender status. ALIGN still only submits Samurai-owned folders.".into()
        }
    };
    WindowsLineStatus {
        host: "windows".into(),
        defender_realtime: realtime,
        exclusions_aligned: aligned,
        paths,
        processes: ALLOWED_PROCESS.iter().map(|s| (*s).to_string()).collect(),
        summary,
    }
}

pub fn align_script(install_dir: &Path, app_data: &Path) -> Result<String, String> {
    let paths = candidate_paths(install_dir, app_data);
    if paths.is_empty() {
        return Err("refused: no Samurai-owned folders to exclude".into());
    }
    for path in &paths {
        if !is_allowed_exclusion_path(&path.to_string_lossy()) {
            return Err("refused to ask Defender to skip a non-Samurai path".into());
        }
    }
    let path_list = paths
        .iter()
        .map(|p| format!("'{}'", p.to_string_lossy().replace('\'', "''")))
        .collect::<Vec<_>>()
        .join(",");
    let proc_list = ALLOWED_PROCESS
        .iter()
        .map(|p| format!("'{p}'"))
        .collect::<Vec<_>>()
        .join(",");
    Ok(format!(
        "foreach ($p in @({path_list})) {{ Add-MpPreference -ExclusionPath $p }}; \
         foreach ($proc in @({proc_list})) {{ Add-MpPreference -ExclusionProcess $proc }}; \
         Write-Output 'Aligned Windows Defender exclusions for Samurai folders only. Real-time protection was not changed.'"
    ))
}

#[cfg(windows)]
fn powershell_json(command: &str) -> Result<String, String> {
    let output = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            command,
        ])
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).into_owned());
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

pub fn query_status(install_dir: &Path, app_data: &Path) -> WindowsLineStatus {
    #[cfg(not(windows))]
    {
        let _ = (install_dir, app_data);
        return preview_status();
    }
    #[cfg(windows)]
    {
        let realtime = powershell_json(
            "try { (Get-MpComputerStatus).RealTimeProtectionEnabled } catch { '' }",
        )
        .ok()
        .and_then(|text| match text.to_ascii_lowercase().as_str() {
            "true" => Some(true),
            "false" => Some(false),
            _ => None,
        });
        let pref = powershell_json(
            "try { Get-MpPreference | Select-Object ExclusionPath, ExclusionProcess | ConvertTo-Json -Compress } catch { '{}' }",
        )
        .unwrap_or_else(|_| "{}".into());
        let listed_paths = parse_exclusion_paths(&pref);
        let listed_procs = parse_exclusion_processes(&pref);
        status_from_query(install_dir, app_data, realtime, &listed_paths, &listed_procs)
    }
}

pub fn request_align(install_dir: &Path, app_data: &Path) -> Result<String, String> {
    #[cfg(not(windows))]
    {
        let _ = (install_dir, app_data);
        return Ok(preview_status().summary);
    }
    #[cfg(windows)]
    {
        let _ = align_script(install_dir, app_data)?;
        let script_path = std::env::temp_dir().join("samurai-align-defender.ps1");
        std::fs::write(
            &script_path,
            include_str!("../windows/align-defender.ps1"),
        )
        .map_err(|e| e.to_string())?;
        let file = script_path.display().to_string().replace('\'', "''");
        let install = install_dir.display().to_string().replace('\'', "''");
        let data = app_data.display().to_string().replace('\'', "''");
        let wrapped = format!(
            "Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','{file}','-Action','Align','-InstallDir','{install}','-AppDataDir','{data}'"
        );
        let output = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                &wrapped,
            ])
            .output()
            .map_err(|e| e.to_string())?;
        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            if err.trim().is_empty() {
                return Err(String::from_utf8_lossy(&output.stdout).into_owned());
            }
            return Err(err.into_owned());
        }
        Ok(
            "Defender was asked to skip Samurai folders only. Real-time protection was not changed."
                .into(),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn refuses_downloads_desktop_and_roots() {
        assert!(is_forbidden_exclusion_path(r"C:\Users\ronin\Downloads"));
        assert!(is_forbidden_exclusion_path(r"C:\Users\ronin\Desktop"));
        assert!(is_forbidden_exclusion_path(r"C:\Users\ronin\Music"));
        assert!(!is_allowed_exclusion_path(r"C:\"));
        assert!(!is_allowed_exclusion_path(r"C:\Program Files"));
        assert!(!is_allowed_exclusion_path(r"C:\Users\ronin\Downloads\com.roninsoftworx.samurai"));
    }

    #[test]
    fn allows_samurai_program_and_appdata() {
        assert!(is_allowed_exclusion_path(
            r"C:\Program Files\Samurai"
        ));
        assert!(is_allowed_exclusion_path(
            r"C:\Users\ronin\AppData\Roaming\com.roninsoftworx.samurai"
        ));
        assert!(is_allowed_exclusion_path(
            r"C:\Users\ronin\AppData\Roaming\com.roninsoftworx.samurai\install_gate"
        ));
        assert!(is_allowed_exclusion_process("samurai.exe"));
        assert!(is_allowed_exclusion_process(r"C:\Program Files\Samurai\yara.exe"));
        assert!(!is_allowed_exclusion_process("chrome.exe"));
    }

    #[test]
    fn align_script_never_mentions_downloads_or_disable() {
        let script = align_script(
            Path::new(r"C:\Program Files\Samurai"),
            Path::new(r"C:\Users\ronin\AppData\Roaming\com.roninsoftworx.samurai"),
        )
        .expect("script");
        let lower = script.to_lowercase();
        assert!(script.contains("Add-MpPreference -ExclusionPath"));
        assert!(!lower.contains("downloads"));
        assert!(!lower.contains("desktop"));
        assert!(!lower.contains("disablerealtimemonitoring"));
        assert!(!lower.contains("disableantispyware"));
        assert!(!lower.contains("set-mppreference"));
    }

    #[test]
    fn parse_preference_json_and_cover() {
        let json = r#"{"ExclusionPath":["C:\\Program Files\\Samurai","C:\\Users\\ronin\\AppData\\Roaming\\com.roninsoftworx.samurai"],"ExclusionProcess":["samurai.exe","yara.exe","clamscan.exe","freshclam.exe"]}"#;
        let paths = parse_exclusion_paths(json);
        let procs = parse_exclusion_processes(json);
        let wanted = candidate_paths(
            &PathBuf::from(r"C:\Program Files\Samurai"),
            &PathBuf::from(r"C:\Users\ronin\AppData\Roaming\com.roninsoftworx.samurai"),
        );
        assert!(exclusions_cover(&wanted, &paths));
        let status = status_from_query(
            Path::new(r"C:\Program Files\Samurai"),
            Path::new(r"C:\Users\ronin\AppData\Roaming\com.roninsoftworx.samurai"),
            Some(true),
            &paths,
            &procs,
        );
        assert!(status.exclusions_aligned);
        assert_eq!(status.defender_realtime, Some(true));
        assert!(status.summary.contains("Defender real-time is on"));
    }

    #[test]
    fn sharing_violation_is_transient() {
        let err = std::io::Error::from_raw_os_error(32);
        assert!(is_transient_lock(&err));
        let other = std::io::Error::from_raw_os_error(2);
        assert!(!is_transient_lock(&other));
    }
}
