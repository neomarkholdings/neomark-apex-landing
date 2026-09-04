//! Nested-archive hunt — list inner names without extracting payloads.
//!
//! Warez drops for DAWs rarely arrive as `FLStudio-crack.exe`. They arrive as
//! `Ableton_Live_12.zip` with a keygen sitting next to Setup.exe. Samurai
//! reads ZIP directories and harvests printable names from RAR/7z/SFX
//! overlays. Nothing is unpacked or executed.

use crate::foothold::{
    is_double_exec_extension, is_masquerade_system_binary, looks_like_warez_drop,
};
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

const ZIP_EOCD: &[u8] = b"PK\x05\x06";
const ZIP_CD: &[u8] = b"PK\x01\x02";
const MAX_CD: u64 = 8_000_000;

fn extension_of(name: &str) -> &str {
    name.rsplit_once('.').map(|(_, ext)| ext).unwrap_or("")
}

pub fn is_container_name(name: &str) -> bool {
    matches!(
        extension_of(name),
        "zip" | "rar" | "7z" | "exe" | "scr" | "msi" | "dll"
    )
}

fn basename(name: &str) -> &str {
    name.rsplit(['/', '\\']).next().unwrap_or(name)
}

/// Why this archive (or SFX overlay) should be held. `None` means leave it —
/// a zip that only contains `Setup.exe` is a normal plugin installer.
pub fn hold_reason_from_container(path: &Path) -> Option<String> {
    let names = inner_names(path)?;
    inner_hold_reason(&names)
}

pub fn inner_hold_reason(names: &[String]) -> Option<String> {
    for name in names {
        let base = basename(name);
        if is_double_exec_extension(base) {
            return Some(
                "Archive contains a double-extension executable hidden as a creation.".into(),
            );
        }
        if looks_like_warez_drop(base) {
            return Some(
                "Archive contains a crack/keygen/activator — common trojan, RAT, or ransomware loader.".into(),
            );
        }
        if is_masquerade_system_binary(Path::new(base)) {
            return Some(
                "Archive contains a system binary name — classic RAT / loader masquerade.".into(),
            );
        }
    }
    None
}

fn inner_names(path: &Path) -> Option<Vec<String>> {
    let meta = std::fs::metadata(path).ok()?;
    if !meta.is_file() || meta.len() < 22 {
        return None;
    }
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    let ext = extension_of(&name);
    if ext == "zip" {
        return zip_inner_names(path);
    }
    if ext == "rar" || ext == "7z" {
        return blob_inner_names(path, meta.len());
    }
    if matches!(ext, "exe" | "scr" | "msi" | "dll") {
        if let Some(names) = zip_inner_names(path) {
            if !names.is_empty() {
                return Some(names);
            }
        }
        return blob_inner_names(path, meta.len());
    }
    None
}

fn read_u16(buf: &[u8], at: usize) -> Option<u16> {
    Some(u16::from_le_bytes(buf.get(at..at + 2)?.try_into().ok()?))
}

fn read_u32(buf: &[u8], at: usize) -> Option<u32> {
    Some(u32::from_le_bytes(buf.get(at..at + 4)?.try_into().ok()?))
}

fn find_eocd(buf: &[u8]) -> Option<usize> {
    if buf.len() < 22 {
        return None;
    }
    let start = buf.len().saturating_sub(65_557);
    let mut i = buf.len() - 22;
    loop {
        if buf[i..].starts_with(ZIP_EOCD) {
            return Some(i);
        }
        if i == start {
            return None;
        }
        i -= 1;
    }
}

pub fn zip_inner_names(path: &Path) -> Option<Vec<String>> {
    let mut file = File::open(path).ok()?;
    let len = file.metadata().ok()?.len();
    if len < 22 {
        return None;
    }
    let tail_len = std::cmp::min(len, 65_557) as usize;
    let mut tail = vec![0u8; tail_len];
    file.seek(SeekFrom::End(-(tail_len as i64))).ok()?;
    file.read_exact(&mut tail).ok()?;
    let eocd = find_eocd(&tail)?;
    let cd_size = u64::from(read_u32(&tail, eocd + 12)?);
    let cd_off = u64::from(read_u32(&tail, eocd + 16)?);
    if cd_off == 0xFFFF_FFFF || cd_size == 0 || cd_size > MAX_CD || cd_off.saturating_add(cd_size) > len {
        return None;
    }
    file.seek(SeekFrom::Start(cd_off)).ok()?;
    let mut cd = vec![0u8; cd_size as usize];
    file.read_exact(&mut cd).ok()?;
    parse_central_directory(&cd)
}

fn parse_central_directory(cd: &[u8]) -> Option<Vec<String>> {
    let mut names = Vec::new();
    let mut i = 0usize;
    while i + 46 <= cd.len() {
        if !cd[i..].starts_with(ZIP_CD) {
            break;
        }
        let name_len = usize::from(read_u16(cd, i + 28)?);
        let extra_len = usize::from(read_u16(cd, i + 30)?);
        let comment_len = usize::from(read_u16(cd, i + 32)?);
        let name_at = i + 46;
        let name_end = name_at.checked_add(name_len)?;
        if name_end > cd.len() {
            break;
        }
        if let Ok(name) = std::str::from_utf8(&cd[name_at..name_end]) {
            if !name.ends_with('/') && !name.ends_with('\\') {
                names.push(name.to_string());
            }
        }
        i = name_end
            .checked_add(extra_len)?
            .checked_add(comment_len)?;
        if names.len() >= 400 {
            break;
        }
    }
    if names.is_empty() {
        None
    } else {
        Some(names)
    }
}

fn blob_inner_names(path: &Path, len: u64) -> Option<Vec<String>> {
    let mut file = File::open(path).ok()?;
    let mut buf = Vec::new();
    let head = std::cmp::min(len, 512_000) as usize;
    let mut front = vec![0u8; head];
    file.read_exact(&mut front).ok()?;
    buf.extend_from_slice(&front);
    if len > 512_000 {
        let tail = std::cmp::min(len, 64_000) as i64;
        if file.seek(SeekFrom::End(-tail)).is_ok() {
            let mut back = vec![0u8; tail as usize];
            if file.read_exact(&mut back).is_ok() {
                buf.extend_from_slice(&back);
            }
        }
    }
    let names = harvest_ascii_names(&buf);
    if names.is_empty() {
        None
    } else {
        Some(names)
    }
}

fn harvest_ascii_names(buf: &[u8]) -> Vec<String> {
    let mut out = Vec::new();
    let mut i = 0;
    while i < buf.len() {
        let start = i;
        while i < buf.len() && is_name_byte(buf[i]) {
            i += 1;
        }
        if i - start >= 6 {
            if let Ok(text) = std::str::from_utf8(&buf[start..i]) {
                let lower = text.to_ascii_lowercase();
                if looks_like_inner_file(&lower) {
                    out.push(lower);
                    if out.len() >= 80 {
                        break;
                    }
                }
            }
        }
        i += 1;
    }
    out
}

fn is_name_byte(b: u8) -> bool {
    b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-' | b'/' | b'\\' | b' ')
}

fn looks_like_inner_file(name: &str) -> bool {
    let base = basename(name);
    let ext = extension_of(base);
    matches!(
        ext,
        "exe" | "scr" | "dll" | "bat" | "cmd" | "ps1" | "msi" | "js" | "vbs" | "com" | "pif"
    ) || looks_like_warez_drop(base)
        || is_double_exec_extension(base)
}

/// Uncompressed ZIP bytes for tests. Not a general-purpose writer.
#[cfg(test)]
pub fn store_zip(entries: &[(&str, &[u8])]) -> Vec<u8> {
    fn crc32(data: &[u8]) -> u32 {
        let mut crc = 0xFFFF_FFFFu32;
        for &byte in data {
            crc ^= u32::from(byte);
            for _ in 0..8 {
                crc = if crc & 1 == 1 {
                    (crc >> 1) ^ 0xEDB_88320
                } else {
                    crc >> 1
                };
            }
        }
        !crc
    }
    fn put_u16(buf: &mut Vec<u8>, value: u16) {
        buf.extend_from_slice(&value.to_le_bytes());
    }
    fn put_u32(buf: &mut Vec<u8>, value: u32) {
        buf.extend_from_slice(&value.to_le_bytes());
    }

    let mut locals = Vec::new();
    let mut cd = Vec::new();
    for (name, data) in entries {
        let name_b = name.as_bytes();
        let crc = crc32(data);
        let offset = locals.len() as u32;
        locals.extend_from_slice(b"PK\x03\x04");
        put_u16(&mut locals, 20);
        put_u16(&mut locals, 0);
        put_u16(&mut locals, 0);
        put_u16(&mut locals, 0);
        put_u16(&mut locals, 0);
        put_u32(&mut locals, crc);
        put_u32(&mut locals, data.len() as u32);
        put_u32(&mut locals, data.len() as u32);
        put_u16(&mut locals, name_b.len() as u16);
        put_u16(&mut locals, 0);
        locals.extend_from_slice(name_b);
        locals.extend_from_slice(data);

        cd.extend_from_slice(b"PK\x01\x02");
        put_u16(&mut cd, 20);
        put_u16(&mut cd, 20);
        put_u16(&mut cd, 0);
        put_u16(&mut cd, 0);
        put_u16(&mut cd, 0);
        put_u16(&mut cd, 0);
        put_u32(&mut cd, crc);
        put_u32(&mut cd, data.len() as u32);
        put_u32(&mut cd, data.len() as u32);
        put_u16(&mut cd, name_b.len() as u16);
        put_u16(&mut cd, 0);
        put_u16(&mut cd, 0);
        put_u16(&mut cd, 0);
        put_u16(&mut cd, 0);
        put_u32(&mut cd, 0);
        put_u32(&mut cd, offset);
        cd.extend_from_slice(name_b);
    }
    let cd_off = locals.len() as u32;
    let cd_len = cd.len() as u32;
    let count = entries.len() as u16;
    let mut out = locals;
    out.extend_from_slice(&cd);
    out.extend_from_slice(ZIP_EOCD);
    put_u16(&mut out, 0);
    put_u16(&mut out, 0);
    put_u16(&mut out, count);
    put_u16(&mut out, count);
    put_u32(&mut out, cd_len);
    put_u32(&mut out, cd_off);
    put_u16(&mut out, 0);
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp(label: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "samurai-zip-{}-{}-{}",
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
    fn lists_inner_keygen_in_innocent_daw_zip() {
        let dir = temp("ableton");
        let zip = dir.join("Ableton_Live_12.zip");
        fs::write(
            &zip,
            store_zip(&[
                ("Ableton Live 12/Setup.exe", b"MZ-setup"),
                ("Ableton Live 12/keygen.exe", b"MZ-keygen"),
            ]),
        )
        .unwrap();
        let names = zip_inner_names(&zip).expect("names");
        assert!(names.iter().any(|n| n.ends_with("keygen.exe")));
        assert!(inner_hold_reason(&names).unwrap().contains("keygen"));
        assert!(hold_reason_from_container(&zip).is_some());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn legit_plugin_installer_zip_is_left_alone() {
        let dir = temp("serum");
        let zip = dir.join("Serum_Installer.zip");
        fs::write(
            &zip,
            store_zip(&[
                ("Serum/Setup.exe", b"MZ-setup"),
                ("Serum/Readme.txt", b"buy a license"),
            ]),
        )
        .unwrap();
        let names = zip_inner_names(&zip).expect("names");
        assert!(inner_hold_reason(&names).is_none());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn crackle_sample_pack_inner_wavs_are_not_warez() {
        assert!(inner_hold_reason(&[
            "crackle-pack/kick.wav".into(),
            "crackle-pack/snare.wav".into()
        ])
        .is_none());
    }
}
