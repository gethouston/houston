//! Activity leases — the durability primitive that makes orphaned
//! `running` rows impossible.
//!
//! Every non-terminal activity has a `Lease { lease_id, owner_pid,
//! expires_at }`. The session task that owns the CLI subprocess extends
//! the lease every 5s. The engine's reaper sweeps every 10s: any
//! non-terminal activity whose lease expired (or is missing) gets
//! transitioned to `Interrupted`. No more "stuck on running forever."
//!
//! Wire-compatible: the field is `Option<Lease>` with
//! `skip_serializing_if = "Option::is_none"`, so old activity.json files
//! that don't carry one still load. The reaper treats `lease == None`
//! on a non-terminal row as "already expired" so legacy rows get fixed
//! on first sweep after upgrade.
//!
//! `owner_pid` is recorded so startup reconciliation can ignore leases
//! whose process is genuinely still alive (e.g. a second engine running
//! on the same `~/.houston/`). Without that check, two concurrent
//! engines would steal missions from each other.

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// How long a fresh lease is valid before it must be heartbeated.
///
/// Heartbeat interval is `HEARTBEAT_INTERVAL`; this is 6× that so a
/// single dropped heartbeat doesn't trigger a false-positive
/// interruption. Tuned for "user-visible recovery within ~15s of a
/// process death" without burning IO every second.
pub const LEASE_TTL: Duration = Duration::seconds(30);

/// How often the session task extends its lease while running.
pub const HEARTBEAT_INTERVAL: Duration = Duration::seconds(5);

/// How often the reaper sweeps for expired leases.
pub const REAPER_INTERVAL: Duration = Duration::seconds(10);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Lease {
    pub lease_id: String,
    pub owner_pid: u32,
    pub expires_at: DateTime<Utc>,
}

impl Lease {
    /// Create a fresh lease owned by the current process, valid for
    /// `LEASE_TTL` from now.
    pub fn fresh() -> Self {
        Self {
            lease_id: Uuid::new_v4().to_string(),
            owner_pid: std::process::id(),
            expires_at: Utc::now() + LEASE_TTL,
        }
    }

    /// Extend the lease's expiration to `now + LEASE_TTL`. Owner unchanged.
    pub fn extended(&self) -> Self {
        Self {
            lease_id: self.lease_id.clone(),
            owner_pid: self.owner_pid,
            expires_at: Utc::now() + LEASE_TTL,
        }
    }

    /// `true` once the lease's `expires_at` is in the past.
    pub fn is_expired(&self) -> bool {
        self.expires_at < Utc::now()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fresh_lease_is_not_expired() {
        let l = Lease::fresh();
        assert!(!l.is_expired());
        assert_eq!(l.owner_pid, std::process::id());
    }

    #[test]
    fn extended_lease_keeps_id_and_pushes_expiry() {
        let l = Lease::fresh();
        let before = l.expires_at;
        std::thread::sleep(std::time::Duration::from_millis(5));
        let l2 = l.extended();
        assert_eq!(l2.lease_id, l.lease_id);
        assert_eq!(l2.owner_pid, l.owner_pid);
        assert!(l2.expires_at > before);
    }

    #[test]
    fn explicitly_expired_lease_is_expired() {
        let l = Lease {
            lease_id: "x".into(),
            owner_pid: 1,
            expires_at: Utc::now() - Duration::seconds(1),
        };
        assert!(l.is_expired());
    }

    #[test]
    fn serde_round_trip_preserves_fields() {
        let l = Lease::fresh();
        let json = serde_json::to_string(&l).unwrap();
        let back: Lease = serde_json::from_str(&json).unwrap();
        assert_eq!(back.lease_id, l.lease_id);
        assert_eq!(back.owner_pid, l.owner_pid);
        // millisecond-precision rounding is fine; just confirm it parsed.
        assert_eq!(back.expires_at.timestamp(), l.expires_at.timestamp());
    }
}
