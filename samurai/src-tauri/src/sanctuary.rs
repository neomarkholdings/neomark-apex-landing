//! Immutable Sanctuary Zones middleware.
//!
//! Any deletion, quarantine, or remediation targeting a path that contains a
//! protected identifier is aborted before the filesystem is touched.

use std::path::{Path, PathBuf};

/// Exact operator-facing abort payload. Do not paraphrase.
pub const ERR_SANCTUARY_ZONE: &str =
    "ERR_SANCTUARY_ZONE: Target resides in an immutable protected sector. Action aborted.";

/// Protected path identifiers (matched as substrings after separator normalization).
pub const SANCTUARY_IDENTIFIERS: &[&str] = &["neomark", "retroblazed", "/Music", "/Studio-Projects"];

pub fn normalize_path(path: &str) -> String {
    path.replace('\\', "/").to_lowercase()
}

pub fn is_sanctuary_path(path: &str) -> bool {
    let normalized = normalize_path(path);
    SANCTUARY_IDENTIFIERS.iter().any(|marker| {
        let needle = marker.replace('\\', "/").to_lowercase();
        normalized.contains(&needle)
    })
}

pub fn is_sanctuary(path: &Path) -> bool {
    is_sanctuary_path(&path.to_string_lossy())
}

/// Returns `Ok(canonical-ish PathBuf)` or the sanctuary abort error.
pub fn assert_not_sanctuary(path: &Path) -> Result<PathBuf, String> {
    if is_sanctuary(path) {
        Err(ERR_SANCTUARY_ZONE.to_string())
    } else {
        Ok(path.to_path_buf())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn blocks_neomark_substring() {
        assert!(is_sanctuary_path("/var/lib/Neomark/holdings.bin"));
        assert!(is_sanctuary(Path::new("C:\\\\Users\\\\dev\\\\neomark-notes.txt")));
    }

    #[test]
    fn blocks_retroblazed_substring() {
        assert!(is_sanctuary_path("/home/streamer/RETROBLAZED/mix.wav"));
    }

    #[test]
    fn blocks_music_directory() {
        assert!(is_sanctuary_path("/Users/ronin/Music/session.aiff"));
        assert!(is_sanctuary_path("C:\\\\Users\\\\ronin\\\\Music\\\\kick.wav"));
    }

    #[test]
    fn blocks_studio_projects_directory() {
        assert!(is_sanctuary_path("/home/ronin/Studio-Projects/ep1/vocal.wav"));
        assert!(is_sanctuary_path("D:\\\\Studio-Projects\\\\master.wav"));
    }

    #[test]
    fn allows_unrelated_paths() {
        assert!(!is_sanctuary_path("/tmp/samurai-lab/tainted.txt"));
        assert!(!is_sanctuary_path("/home/ronin/Downloads/invoice.pdf"));
        assert!(!is_sanctuary_path("/var/tmp/immune-cache.bin"));
    }

    #[test]
    fn abort_payload_is_exact() {
        let err = assert_not_sanctuary(Path::new("/Music/secret.wav")).unwrap_err();
        assert_eq!(err, ERR_SANCTUARY_ZONE);
        assert!(assert_not_sanctuary(Path::new("/tmp/clean.bin")).is_ok());
    }
}
