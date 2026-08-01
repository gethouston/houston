//! Registry of the single active loopback listener, ordered by **generation**.
//!
//! Exactly one listener is meant to be bound at a time, and every operation on
//! it is scoped by an attempt id. Two properties depend on that id:
//!
//!  * **A late cancel is safe.** `cancel_oauth_loopback` used to cancel
//!    "whatever is current", so a fire-and-forget cancel from an abandoned
//!    attempt could arrive after the user re-clicked and kill the NEW attempt's
//!    port (the sign-in then hung until the app was quit).
//!  * **Concurrent starts are ordered by USER INITIATION.** The id is minted at
//!    command entry and is monotonic, so it IS the generation. Two rapid clicks
//!    both run `start_oauth_loopback` concurrently; without a generation the
//!    winner was whichever coroutine reached `install` last, which could be the
//!    OLDER click — it would then supersede the attempt the user is watching.
//!    `claim` / `install` both refuse a generation older than `newest_claim`,
//!    and `newest_claim` deliberately survives the window where `active` is
//!    `None` because the winner is still binding its socket.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, MutexGuard};

use tokio::sync::oneshot;

/// A listener currently bound to a loopback port.
pub struct ActiveListener {
    /// The generation that started it. Only a cancel carrying THIS id may fire
    /// it, and only a NEWER generation may displace it.
    pub id: u64,
    /// Firing this makes the listener task drop its `TcpListener`, freeing the
    /// port immediately instead of waiting out the 300s self-timeout.
    pub cancel: oneshot::Sender<()>,
    /// Resolves once the task has actually exited and the port is released, so
    /// a superseding start can bind the SAME port instead of the next candidate.
    pub freed: oneshot::Receiver<()>,
}

/// Outcome of claiming the loopback for a generation, before binding a socket.
pub enum Claim {
    /// This generation is the newest; any listener it displaced comes back so
    /// the caller can supersede it (freeing that port before we bind).
    Won(Option<ActiveListener>),
    /// A NEWER click already claimed the loopback, so THIS invocation is stale
    /// and must bind nothing.
    Stale { current: u64 },
}

/// Outcome of installing a bound listener.
pub enum Installed {
    /// We are current. Anything we displaced comes back for superseding.
    Ok(Option<ActiveListener>),
    /// A newer generation claimed the loopback while we were binding. The
    /// caller must drop the socket it bound and report the supersession.
    Stale { newest: u64 },
}

#[derive(Default)]
struct Inner {
    active: Option<ActiveListener>,
    /// Highest generation that has claimed the loopback. Survives the window
    /// where `active` is `None` because the winner is still binding.
    newest_claim: u64,
}

#[derive(Default)]
pub struct OauthLoopbackState {
    inner: Mutex<Inner>,
    next_id: AtomicU64,
}

impl OauthLoopbackState {
    fn lock(&self) -> Result<MutexGuard<'_, Inner>, String> {
        self.inner
            .lock()
            .map_err(|e| format!("oauth loopback state lock poisoned: {e}"))
    }

    /// Mint the generation for a new attempt, at command entry. Ids start at 1,
    /// so 0 is never a live attempt and can't accidentally match.
    pub fn mint_id(&self) -> u64 {
        self.next_id.fetch_add(1, Ordering::Relaxed) + 1
    }

    /// Claim the loopback for `id` before binding. Refuses a generation older
    /// than one that already claimed.
    pub fn claim(&self, id: u64) -> Result<Claim, String> {
        let mut inner = self.lock()?;
        if inner.newest_claim > id {
            return Ok(Claim::Stale {
                current: inner.newest_claim,
            });
        }
        inner.newest_claim = id;
        Ok(Claim::Won(inner.active.take()))
    }

    /// Install a bound listener as the current one. Refuses (and drops) a
    /// listener whose generation was overtaken while it was binding.
    pub fn install(&self, listener: ActiveListener) -> Result<Installed, String> {
        let mut inner = self.lock()?;
        if inner.newest_claim > listener.id {
            return Ok(Installed::Stale {
                newest: inner.newest_claim,
            });
        }
        Ok(Installed::Ok(inner.active.replace(listener)))
    }

    /// Take the current listener ONLY if it is `id`'s. A stale cancel therefore
    /// finds nothing and leaves a newer attempt's listener untouched.
    pub fn take_matching(&self, id: u64) -> Result<Option<ActiveListener>, String> {
        let mut inner = self.lock()?;
        match inner.active.as_ref() {
            Some(active) if active.id == id => Ok(inner.active.take()),
            _ => Ok(None),
        }
    }

    /// Drop the slot iff it still holds `id` — what a listener does when it
    /// finishes on its own (callback served, cancelled, or timed out), so the
    /// registry never points at a task that has already exited. `newest_claim`
    /// is deliberately left alone: it is a high-water mark, not a pointer.
    pub fn clear_if(&self, id: u64) -> Result<(), String> {
        self.take_matching(id).map(drop)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn listener(id: u64) -> (ActiveListener, oneshot::Receiver<()>) {
        let (cancel, cancel_rx) = oneshot::channel::<()>();
        let (_freed_tx, freed) = oneshot::channel::<()>();
        (ActiveListener { id, cancel, freed }, cancel_rx)
    }

    #[test]
    fn mint_id_starts_at_one_and_increments() {
        let state = OauthLoopbackState::default();
        assert_eq!(state.mint_id(), 1);
        assert_eq!(state.mint_id(), 2);
    }

    #[test]
    fn install_returns_the_superseded_listener() {
        // A new attempt hands back the previous one so `start_oauth_loopback`
        // can cancel it and reclaim its port.
        let state = OauthLoopbackState::default();
        let (first, _rx1) = listener(1);
        assert!(matches!(state.install(first).unwrap(), Installed::Ok(None)));
        let (second, _rx2) = listener(2);
        match state.install(second).unwrap() {
            Installed::Ok(Some(prev)) => assert_eq!(prev.id, 1),
            _ => panic!("the previous listener was not handed back"),
        }
    }

    #[test]
    fn a_stale_id_cancel_is_a_no_op() {
        // THE regression this id exists for: attempt 1's abandoned cancel must
        // not free attempt 2's port.
        let state = OauthLoopbackState::default();
        let (second, mut cancel_rx) = listener(2);
        state.install(second).unwrap();

        assert!(
            state.take_matching(1).unwrap().is_none(),
            "stale cancel hit"
        );
        assert!(cancel_rx.try_recv().is_err(), "listener 2 was cancelled");

        // The right id still cancels, and the slot empties.
        let taken = state
            .take_matching(2)
            .unwrap()
            .expect("listener 2 is current");
        taken.cancel.send(()).expect("receiver still alive");
        assert!(cancel_rx.try_recv().is_ok());
        assert!(state.take_matching(2).unwrap().is_none());
    }

    #[test]
    fn a_claim_from_an_older_generation_is_stale() {
        // Two rapid clicks: B (newer) claims first because A's coroutine was
        // descheduled. A must NOT then take the loopback back off B.
        let state = OauthLoopbackState::default();
        let older = state.mint_id();
        let newer = state.mint_id();
        assert!(matches!(state.claim(newer).unwrap(), Claim::Won(None)));
        match state.claim(older).unwrap() {
            Claim::Stale { current } => assert_eq!(current, newer),
            Claim::Won(_) => panic!("an older click claimed the loopback"),
        }
    }

    #[test]
    fn install_from_an_older_generation_loses_to_a_newer_claim() {
        // Ordering must follow USER INITIATION, not whichever invocation
        // happens to reach `install` last: A clicked first, B clicked second,
        // and B installs while A is still binding its socket. A must lose.
        let state = OauthLoopbackState::default();
        let older = state.mint_id();
        let newer = state.mint_id();
        assert!(matches!(state.claim(older).unwrap(), Claim::Won(None)));
        assert!(matches!(state.claim(newer).unwrap(), Claim::Won(None)));

        let (b, _b_rx) = listener(newer);
        assert!(matches!(state.install(b).unwrap(), Installed::Ok(None)));

        let (a, mut a_rx) = listener(older);
        match state.install(a).unwrap() {
            Installed::Stale { newest } => assert_eq!(newest, newer),
            Installed::Ok(_) => panic!("the older click superseded the newer one"),
        }
        // B still owns the loopback, and A was told to free its own port.
        assert!(state.take_matching(newer).unwrap().is_some());
        assert!(a_rx.try_recv().is_err(), "A's listener was left installed");
    }

    #[test]
    fn claiming_hands_back_the_listener_being_superseded() {
        let state = OauthLoopbackState::default();
        let first = state.mint_id();
        assert!(matches!(state.claim(first).unwrap(), Claim::Won(None)));
        let (l, _rx) = listener(first);
        assert!(matches!(state.install(l).unwrap(), Installed::Ok(None)));

        // The next click reclaims and gets the previous listener to supersede.
        let second = state.mint_id();
        match state.claim(second).unwrap() {
            Claim::Won(Some(prev)) => assert_eq!(prev.id, first),
            _ => panic!("the previous listener was not handed back"),
        }
    }

    #[test]
    fn clear_if_only_clears_its_own_listener() {
        let state = OauthLoopbackState::default();
        let (second, _rx) = listener(2);
        state.install(second).unwrap();
        // A listener that ended long ago must not clear the current one.
        state.clear_if(1).unwrap();
        assert!(state.take_matching(2).unwrap().is_some());
    }
}
