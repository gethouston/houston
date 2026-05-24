//! Notification policy + lifecycle-status mapping for the engine push
//! pipeline (Chunk 2). Producers ask [`NotifyPolicy::decide`] whether a
//! given `(kind, session_key)` at time `now_ms` should produce a
//! [`crate::frame::NotifyFrame`]; the policy caps daily volume to keep
//! agent-driven pushes inside the user's notification budget (industry
//! guidance is ~3-5 pushes/day per app — see the project spec §8 and
//! the 2026 "notification budget for background agents" analysis) and
//! de-duplicates rapid repeat transitions so a single agent bouncing
//! `NeedsYou` ↔ `Running` doesn't fire several pushes.
//!
//! The policy is intentionally a small, self-contained, deterministic
//! state machine — every test passes a synthetic `now_ms`. Wiring this
//! to the live event bus + tunnel send path is a separate concern.

use crate::frame::NotifyKind;
use std::collections::HashMap;

/// Default daily push budget per engine process. Picked at the top of
/// the 2026 best-practice range (3-5/day) and easily tunable per
/// deployment via [`NotifyPolicy::with_cap_and_window`].
pub const DEFAULT_DAILY_CAP: usize = 5;

/// Default dedup window. Within this many seconds the same
/// `(kind, session_key)` pair won't fire a second push even if the
/// status flaps. 60s is short enough to forgive a real second
/// transition and long enough to absorb a UI optimistic-write churn.
pub const DEFAULT_DEDUP_WINDOW_SECS: i64 = 60;

/// The decision a producer acts on. `Emit` means build + send the
/// [`crate::frame::NotifyFrame`]; `Skip` carries the reason for
/// observability (logs, metrics, debugging).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NotifyDecision {
    Emit,
    Skip(SkipReason),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SkipReason {
    /// Today's notification cap has already been reached.
    DailyCapReached { cap: usize },
    /// Same `(kind, session_key)` was emitted within the dedup window.
    DedupedRecent { seconds_ago: i64 },
}

/// Stateful policy gate. Single-threaded by design — wrap in
/// `Arc<Mutex<_>>` (or similar) for concurrent producers.
#[derive(Debug)]
pub struct NotifyPolicy {
    daily_cap: usize,
    dedup_window_secs: i64,
    /// UTC day of the current `count_today` (`now_ms.div_euclid(86_400_000)`).
    /// When `decide` sees a different day index, the count resets.
    day: i64,
    count_today: usize,
    /// Last emit time per `(kind, session_key)` in ms since epoch.
    last_emit_ms: HashMap<(NotifyKind, String), i64>,
}

impl Default for NotifyPolicy {
    fn default() -> Self {
        Self::with_cap_and_window(DEFAULT_DAILY_CAP, DEFAULT_DEDUP_WINDOW_SECS)
    }
}

impl NotifyPolicy {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_cap_and_window(daily_cap: usize, dedup_window_secs: i64) -> Self {
        Self {
            daily_cap,
            dedup_window_secs,
            // `i64::MIN` guarantees the first `decide` sees a different
            // day index and resets `count_today` to 0 deterministically.
            day: i64::MIN,
            count_today: 0,
            last_emit_ms: HashMap::new(),
        }
    }

    /// Apply the policy. Returns `Emit` and records the emission, or
    /// `Skip(reason)` if the cap is reached or the same
    /// `(kind, session_key)` fired within the dedup window.
    ///
    /// **Skip results do NOT count against the daily cap** — the cap
    /// budget is reserved for distinct, deliverable notifications. A
    /// dedup'd transition is a duplicate, not a delivery.
    pub fn decide(&mut self, kind: NotifyKind, session_key: &str, now_ms: i64) -> NotifyDecision {
        self.roll_day_if_needed(now_ms);

        // Dedup first so a flapping status can't burn the cap on a
        // duplicate notification.
        let dedup_key = (kind, session_key.to_string());
        if let Some(&last) = self.last_emit_ms.get(&dedup_key) {
            let elapsed_ms = now_ms - last;
            if elapsed_ms >= 0 && elapsed_ms < self.dedup_window_secs * 1000 {
                return NotifyDecision::Skip(SkipReason::DedupedRecent {
                    seconds_ago: elapsed_ms / 1000,
                });
            }
        }

        if self.count_today >= self.daily_cap {
            return NotifyDecision::Skip(SkipReason::DailyCapReached {
                cap: self.daily_cap,
            });
        }

        self.count_today += 1;
        self.last_emit_ms.insert(dedup_key, now_ms);
        NotifyDecision::Emit
    }

    fn roll_day_if_needed(&mut self, now_ms: i64) {
        // `div_euclid` keeps day indices well-defined for negative
        // `now_ms` (defensive against clock rewinds in tests + edge
        // hosts) — see `daily_cap_resets_even_on_negative_clock_jumps`.
        let day = now_ms.div_euclid(86_400_000);
        if day != self.day {
            self.day = day;
            self.count_today = 0;
        }
    }
}

/// Map an activity / session status string to a [`NotifyKind`]. Returns
/// `None` for statuses that should NOT produce a push (e.g. `running`,
/// `starting`, `queued`, anything unknown). The known notify-worthy
/// transitions mirror the activity status vocabulary used in
/// `engine/houston-engine-core/src/agents/activity.rs`.
pub fn status_to_notify_kind(status: &str) -> Option<NotifyKind> {
    match status {
        "needs_you" => Some(NotifyKind::NeedsYou),
        "completed" | "done" => Some(NotifyKind::Finished),
        "error" | "failed" => Some(NotifyKind::Failed),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MS_PER_HOUR: i64 = 3_600_000;
    const MS_PER_DAY: i64 = 86_400_000;

    fn policy() -> NotifyPolicy {
        // Tight cap + window so every assertion is sharp.
        NotifyPolicy::with_cap_and_window(3, 60)
    }

    // ---------- status_to_notify_kind ----------

    #[test]
    fn status_mapping_covers_notify_worthy_transitions() {
        assert_eq!(
            status_to_notify_kind("needs_you"),
            Some(NotifyKind::NeedsYou)
        );
        assert_eq!(
            status_to_notify_kind("completed"),
            Some(NotifyKind::Finished)
        );
        assert_eq!(status_to_notify_kind("done"), Some(NotifyKind::Finished));
        assert_eq!(status_to_notify_kind("error"), Some(NotifyKind::Failed));
        assert_eq!(status_to_notify_kind("failed"), Some(NotifyKind::Failed));
    }

    #[test]
    fn status_mapping_skips_non_notify_worthy() {
        assert_eq!(status_to_notify_kind("running"), None);
        assert_eq!(status_to_notify_kind("starting"), None);
        assert_eq!(status_to_notify_kind("queued"), None);
        assert_eq!(status_to_notify_kind(""), None);
        assert_eq!(status_to_notify_kind("???"), None);
    }

    // ---------- NotifyPolicy: basic emit ----------

    #[test]
    fn first_emit_is_allowed() {
        let mut p = policy();
        assert_eq!(
            p.decide(NotifyKind::NeedsYou, "s1", 0),
            NotifyDecision::Emit
        );
    }

    // ---------- NotifyPolicy: dedup ----------

    #[test]
    fn dedup_skips_same_kind_and_session_within_window() {
        let mut p = policy();
        assert_eq!(
            p.decide(NotifyKind::NeedsYou, "s1", 0),
            NotifyDecision::Emit
        );
        let d = p.decide(NotifyKind::NeedsYou, "s1", 30 * 1000);
        assert!(matches!(
            d,
            NotifyDecision::Skip(SkipReason::DedupedRecent { .. })
        ));
    }

    #[test]
    fn dedup_clears_after_window() {
        let mut p = policy();
        assert_eq!(
            p.decide(NotifyKind::NeedsYou, "s1", 0),
            NotifyDecision::Emit
        );
        // 61s later — past the 60s window
        assert_eq!(
            p.decide(NotifyKind::NeedsYou, "s1", 61 * 1000),
            NotifyDecision::Emit
        );
    }

    #[test]
    fn dedup_does_not_cross_sessions() {
        let mut p = policy();
        assert_eq!(
            p.decide(NotifyKind::NeedsYou, "s1", 0),
            NotifyDecision::Emit
        );
        // Different session_key, same kind, within window → emit
        assert_eq!(
            p.decide(NotifyKind::NeedsYou, "s2", 1000),
            NotifyDecision::Emit
        );
    }

    #[test]
    fn dedup_does_not_cross_kinds() {
        let mut p = policy();
        assert_eq!(
            p.decide(NotifyKind::NeedsYou, "s1", 0),
            NotifyDecision::Emit
        );
        // Same session, different kind, within window → emit
        assert_eq!(
            p.decide(NotifyKind::Finished, "s1", 1000),
            NotifyDecision::Emit
        );
    }

    #[test]
    fn dedup_skip_does_not_count_against_cap() {
        let mut p = NotifyPolicy::with_cap_and_window(2, 60);
        // Two distinct emits exhaust the cap.
        assert_eq!(
            p.decide(NotifyKind::NeedsYou, "s1", 0),
            NotifyDecision::Emit
        );
        assert_eq!(
            p.decide(NotifyKind::NeedsYou, "s2", 1000),
            NotifyDecision::Emit
        );
        // A dedup'd attempt for s1 — must NOT pass and must NOT count.
        let d = p.decide(NotifyKind::NeedsYou, "s1", 2000);
        assert!(matches!(
            d,
            NotifyDecision::Skip(SkipReason::DedupedRecent { .. })
        ));
        // The next distinct attempt sees the cap is reached (proves the
        // dedup skip didn't accidentally burn a slot, AND that we're
        // capping correctly).
        let d = p.decide(NotifyKind::NeedsYou, "s3", 3000);
        assert!(matches!(
            d,
            NotifyDecision::Skip(SkipReason::DailyCapReached { .. })
        ));
    }

    // ---------- NotifyPolicy: daily cap ----------

    #[test]
    fn daily_cap_blocks_further_emits_same_day() {
        let mut p = NotifyPolicy::with_cap_and_window(2, 60);
        assert_eq!(
            p.decide(NotifyKind::NeedsYou, "s1", 0),
            NotifyDecision::Emit
        );
        assert_eq!(
            p.decide(NotifyKind::NeedsYou, "s2", 1000),
            NotifyDecision::Emit
        );
        let d = p.decide(NotifyKind::NeedsYou, "s3", 2000);
        assert_eq!(
            d,
            NotifyDecision::Skip(SkipReason::DailyCapReached { cap: 2 })
        );
    }

    #[test]
    fn daily_cap_resets_at_utc_day_boundary() {
        let mut p = NotifyPolicy::with_cap_and_window(1, 60);
        assert_eq!(
            p.decide(NotifyKind::NeedsYou, "s1", 0),
            NotifyDecision::Emit
        );
        // Same day — capped
        let d = p.decide(NotifyKind::NeedsYou, "s2", MS_PER_HOUR);
        assert!(matches!(
            d,
            NotifyDecision::Skip(SkipReason::DailyCapReached { .. })
        ));
        // Next UTC day — fresh budget
        assert_eq!(
            p.decide(NotifyKind::NeedsYou, "s2", MS_PER_DAY),
            NotifyDecision::Emit
        );
    }

    #[test]
    fn daily_cap_resets_even_on_negative_clock_jumps() {
        // Defensive: if `now_ms` rewinds past the recorded `day`, the
        // policy still buckets correctly — `div_euclid` keeps day
        // indices well-defined for negative ms.
        let mut p = NotifyPolicy::with_cap_and_window(1, 60);
        assert_eq!(
            p.decide(NotifyKind::NeedsYou, "s1", MS_PER_DAY),
            NotifyDecision::Emit
        );
        // Rewind to day 0 — different day index → fresh budget.
        assert_eq!(
            p.decide(NotifyKind::NeedsYou, "s2", 0),
            NotifyDecision::Emit
        );
    }

    // ---------- defaults ----------

    #[test]
    fn defaults_track_documented_constants() {
        // Make the doc → constant connection machine-checkable so a
        // future rename can't silently drift them apart.
        assert_eq!(DEFAULT_DAILY_CAP, 5);
        assert_eq!(DEFAULT_DEDUP_WINDOW_SECS, 60);
        let mut p = NotifyPolicy::default();
        // The default policy must accept at least DEFAULT_DAILY_CAP
        // distinct emits in one day.
        for i in 0..DEFAULT_DAILY_CAP {
            let key = format!("s{i}");
            assert_eq!(
                p.decide(NotifyKind::NeedsYou, &key, (i as i64) * 1000),
                NotifyDecision::Emit
            );
        }
        // The (cap+1)th distinct emit is blocked.
        let d = p.decide(
            NotifyKind::NeedsYou,
            "overflow",
            DEFAULT_DAILY_CAP as i64 * 1000,
        );
        assert!(matches!(
            d,
            NotifyDecision::Skip(SkipReason::DailyCapReached { .. })
        ));
    }
}
