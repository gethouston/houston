//! Linear rate-limit budgeter — complexity-aware token bucket.
//!
//! Linear's quota is [`crate::RATE_LIMIT_POINTS_PER_HOUR`] complexity
//! points per OAuth app, with per-query caps. We track a rolling
//! bucket: capacity = full hourly quota, refill = quota / 3600 points
//! per second. Each dispatch estimates its complexity cost (cynic-
//! codegen will surface this from the schema once queries land) and
//! consumes that many tokens before the request fires.
//!
//! ## Why complexity-aware, not request-count
//!
//! Linear charges per GraphQL **complexity** (a function of field
//! depth × child connections × `first: N` page sizes), not per HTTP
//! request. Counting requests would let a deep query exhaust the
//! budget invisibly. The bucket holds `u32` points; cost estimates
//! come from cynic at compile time (C5 onwards).
//!
//! ## Priority lanes
//!
//! When the bucket is low, the engine prioritizes:
//! 1. AgentSessionEvent egress (5s budget is HARD).
//! 2. Webhook-triggered mutations (state writeback, comments).
//! 3. User-initiated reads (UI fetches on demand).
//! 4. Polling reconciles (lowest — they have a webhook backstop).
//!
//! C2 ships the bucket primitive. Priority-aware dispatcher is
//! layered on top in C7 (engine-core orchestration).

use std::time::{Duration, Instant};

/// Refill rate in points per second.
pub const REFILL_POINTS_PER_SEC: u32 = crate::RATE_LIMIT_POINTS_PER_HOUR / 3_600;

/// Rolling token bucket. Not thread-safe on its own — wrap in
/// [`std::sync::Mutex`] or [`tokio::sync::Mutex`] at the call site if
/// shared across tasks.
#[derive(Debug, Clone)]
pub struct TokenBucket {
    capacity: u32,
    refill_per_sec: u32,
    tokens: f64,
    last_refill: Instant,
}

impl TokenBucket {
    /// New bucket with Linear's documented quota (full at start).
    pub fn linear_default() -> Self {
        Self::new(crate::RATE_LIMIT_POINTS_PER_HOUR, REFILL_POINTS_PER_SEC)
    }

    /// New bucket — explicit capacity + refill rate (testing).
    pub fn new(capacity: u32, refill_per_sec: u32) -> Self {
        Self {
            capacity,
            refill_per_sec,
            tokens: capacity as f64,
            last_refill: Instant::now(),
        }
    }

    /// Refill the bucket based on wall-clock time since the last
    /// refill, capped at capacity.
    fn refill(&mut self) {
        let now = Instant::now();
        let elapsed = now.duration_since(self.last_refill).as_secs_f64();
        let added = elapsed * self.refill_per_sec as f64;
        self.tokens = (self.tokens + added).min(self.capacity as f64);
        self.last_refill = now;
    }

    /// Attempt to consume `cost` tokens. Returns Ok(()) on success.
    /// On budget exhaustion returns the [`Duration`] the caller would
    /// need to wait for the bucket to refill enough for this cost.
    /// (The caller decides whether to wait or abort.)
    pub fn try_consume(&mut self, cost: u32) -> Result<(), Duration> {
        self.refill();
        if (self.tokens as u32) >= cost {
            self.tokens -= cost as f64;
            Ok(())
        } else {
            let deficit = cost as f64 - self.tokens;
            let wait_secs = deficit / self.refill_per_sec as f64;
            Err(Duration::from_secs_f64(wait_secs.max(0.0)))
        }
    }

    /// Tokens currently available (after refill).
    pub fn available(&mut self) -> u32 {
        self.refill();
        self.tokens as u32
    }

    /// Test-only: force the `last_refill` instant backwards by `dur`.
    /// Lets tests assert refill math without sleeping.
    #[cfg(test)]
    fn force_age(&mut self, dur: Duration) {
        self.last_refill = self
            .last_refill
            .checked_sub(dur)
            .expect("test instant arithmetic");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refill_rate_is_833_points_per_second() {
        // 3_000_000 / 3600 ≈ 833 (integer division)
        assert_eq!(REFILL_POINTS_PER_SEC, 833);
    }

    #[test]
    fn fresh_bucket_starts_full() {
        let mut b = TokenBucket::linear_default();
        assert!(b.available() >= crate::RATE_LIMIT_POINTS_PER_HOUR - 1);
    }

    #[test]
    fn consume_within_budget_succeeds() {
        let mut b = TokenBucket::new(1000, 10);
        assert!(b.try_consume(100).is_ok());
        assert!(b.try_consume(500).is_ok());
        // available drops accordingly
        assert!(b.available() <= 400);
    }

    #[test]
    fn consume_over_budget_returns_wait_duration() {
        let mut b = TokenBucket::new(100, 10);
        let _ = b.try_consume(100); // drain it
        let err = b.try_consume(50).unwrap_err();
        // 50 tokens at 10/sec → ~5 seconds wait
        assert!(err.as_secs_f64() >= 4.5 && err.as_secs_f64() <= 5.5);
    }

    #[test]
    fn refill_advances_with_time() {
        let mut b = TokenBucket::new(1000, 100);
        let _ = b.try_consume(500); // 500 remaining
        b.force_age(Duration::from_secs(3));
        // 3s × 100/sec = 300 refilled → 800 available
        let avail = b.available();
        assert!(avail >= 795 && avail <= 805, "expected ~800, got {avail}");
    }

    #[test]
    fn refill_caps_at_capacity() {
        let mut b = TokenBucket::new(100, 10);
        // Force a huge time gap — refill should saturate, not overflow.
        b.force_age(Duration::from_secs(100_000));
        assert_eq!(b.available(), 100);
    }
}
