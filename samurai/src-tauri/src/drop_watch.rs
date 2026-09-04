//! Poll-state for the install gate.
//!
//! First pass inventories existing files and does not hold them. After that,
//! a new path or a changed mtime is a drop. Isolated from Tauri so the
//! inventory/hold split can be unit-tested without GTK.

use std::collections::HashMap;
use std::path::PathBuf;

pub struct DropWatch {
    seen: HashMap<PathBuf, u128>,
    primed: bool,
}

impl Default for DropWatch {
    fn default() -> Self {
        Self::new()
    }
}

impl DropWatch {
    pub fn new() -> Self {
        Self {
            seen: HashMap::new(),
            primed: false,
        }
    }

    /// Returns true when this path should be inspected as a new/changed drop.
    pub fn note(&mut self, path: PathBuf, stamp: u128) -> bool {
        if !self.primed {
            self.seen.insert(path, stamp);
            return false;
        }
        if self.seen.get(&path) == Some(&stamp) {
            return false;
        }
        self.seen.insert(path, stamp);
        true
    }

    pub fn finish_prime(&mut self) {
        self.primed = true;
    }

    pub fn primed(&self) -> bool {
        self.primed
    }

    pub fn maybe_reprime(&mut self) {
        if self.seen.len() > 4000 {
            self.seen.clear();
            self.primed = false;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn existing_files_are_not_drops_until_primed() {
        let mut watch = DropWatch::new();
        let already = PathBuf::from("/tmp/Downloads/old-plugin.zip");
        assert!(!watch.note(already.clone(), 10));
        watch.finish_prime();
        assert!(!watch.note(already, 10));
        assert!(watch.note(
            PathBuf::from("/tmp/Downloads/Ableton_Live_12.zip"),
            11
        ));
    }

    #[test]
    fn mtime_change_counts_as_a_new_drop() {
        let mut watch = DropWatch::new();
        let path = PathBuf::from("/tmp/Downloads/FLStudio-crack.exe");
        assert!(!watch.note(path.clone(), 1));
        watch.finish_prime();
        assert!(watch.note(path, 2));
    }
}
