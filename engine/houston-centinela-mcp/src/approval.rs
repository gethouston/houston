//! Human-in-the-loop approval registry: the channel a `STEP_UP` verdict waits
//! on. A pending approval is opened when the gate escalates, and resolved when
//! the owner answers SI or NO over WhatsApp (or the request times out).
//!
//! Free-text replies carry no id, so [`ApprovalRegistry::resolve_latest`]
//! matches the most recent pending request, which is correct for the
//! one-owner, one-question-at-a-time flow Centinela uses.

use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tokio::sync::oneshot;
use tokio::time::timeout;

/// How a pending approval ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    Approved,
    Denied,
    TimedOut,
}

/// The set of approvals awaiting a human answer. Shared (behind an `Arc`)
/// between the gate path that opens requests and the webhook that resolves them.
#[derive(Default)]
pub struct ApprovalRegistry {
    pending: Mutex<HashMap<u64, oneshot::Sender<bool>>>,
    order: Mutex<VecDeque<u64>>,
    next: AtomicU64,
}

impl ApprovalRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    /// Open a new pending approval. Returns its id and the receiver to await.
    pub fn open(&self) -> (u64, oneshot::Receiver<bool>) {
        let id = self.next.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = oneshot::channel();
        self.pending.lock().unwrap().insert(id, tx);
        self.order.lock().unwrap().push_back(id);
        (id, rx)
    }

    /// Await the owner's answer for `id`, up to `ttl`. Cleans up afterward so a
    /// timed-out request can never be resolved by a late reply.
    pub async fn wait(&self, id: u64, rx: oneshot::Receiver<bool>, ttl: Duration) -> Outcome {
        let outcome = match timeout(ttl, rx).await {
            Ok(Ok(true)) => Outcome::Approved,
            Ok(Ok(false)) => Outcome::Denied,
            _ => Outcome::TimedOut,
        };
        self.forget(id);
        outcome
    }

    /// Resolve the most recent still-pending approval with `approved`. Returns
    /// the id it resolved, or `None` if nothing was waiting.
    pub fn resolve_latest(&self, approved: bool) -> Option<u64> {
        let mut order = self.order.lock().unwrap();
        while let Some(id) = order.pop_back() {
            if let Some(tx) = self.pending.lock().unwrap().remove(&id) {
                match tx.send(approved) {
                    Ok(()) => return Some(id),
                    Err(_) => continue, // receiver already timed out; try the next
                }
            }
        }
        None
    }

    fn forget(&self, id: u64) {
        self.pending.lock().unwrap().remove(&id);
        self.order.lock().unwrap().retain(|x| *x != id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn si_resolves_pending_as_approved() {
        let reg = ApprovalRegistry::new();
        let (id, rx) = reg.open();
        assert_eq!(reg.resolve_latest(true), Some(id));
        assert_eq!(
            reg.wait(id, rx, Duration::from_secs(1)).await,
            Outcome::Approved
        );
    }

    #[tokio::test]
    async fn no_resolves_pending_as_denied() {
        let reg = ApprovalRegistry::new();
        let (id, rx) = reg.open();
        assert_eq!(reg.resolve_latest(false), Some(id));
        assert_eq!(
            reg.wait(id, rx, Duration::from_secs(1)).await,
            Outcome::Denied
        );
    }

    #[tokio::test]
    async fn no_reply_times_out() {
        let reg = ApprovalRegistry::new();
        let (id, rx) = reg.open();
        assert_eq!(
            reg.wait(id, rx, Duration::from_millis(20)).await,
            Outcome::TimedOut
        );
        // After a timeout the request is forgotten, so a late reply finds nothing.
        assert_eq!(reg.resolve_latest(true), None);
    }

    #[test]
    fn resolve_with_nothing_pending_is_none() {
        assert_eq!(ApprovalRegistry::new().resolve_latest(true), None);
    }

    #[tokio::test]
    async fn resolve_latest_targets_most_recent() {
        let reg = ApprovalRegistry::new();
        let (id_a, rx_a) = reg.open();
        let (id_b, rx_b) = reg.open();
        // The most recent pending (b) is the one the reply answers.
        assert_eq!(reg.resolve_latest(true), Some(id_b));
        assert_eq!(
            reg.wait(id_b, rx_b, Duration::from_secs(1)).await,
            Outcome::Approved
        );
        // a is still open until its own reply or timeout.
        assert_eq!(reg.resolve_latest(false), Some(id_a));
        assert_eq!(
            reg.wait(id_a, rx_a, Duration::from_secs(1)).await,
            Outcome::Denied
        );
    }
}
