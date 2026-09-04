//! Timed protection disarm. Holds pause; sanctuary never does.

pub const DISARM_MS: u128 = 15 * 60 * 1000;

pub fn now_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

pub fn rearm_deadline(now: u128, armed: bool) -> Option<u128> {
    if armed {
        None
    } else {
        Some(now.saturating_add(DISARM_MS))
    }
}

/// True when a disarmed session has expired and must come back on.
pub fn due_to_rearm(now: u128, armed: bool, until: Option<u128>) -> bool {
    if armed {
        return false;
    }
    match until {
        Some(deadline) => now >= deadline,
        None => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn armed_sessions_have_no_deadline() {
        assert_eq!(rearm_deadline(1_000, true), None);
        assert!(!due_to_rearm(1_000, true, Some(0)));
    }

    #[test]
    fn disarm_sets_a_fifteen_minute_deadline() {
        assert_eq!(rearm_deadline(0, false), Some(DISARM_MS));
        assert!(!due_to_rearm(DISARM_MS - 1, false, Some(DISARM_MS)));
        assert!(due_to_rearm(DISARM_MS, false, Some(DISARM_MS)));
    }
}
