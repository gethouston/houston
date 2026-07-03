//! Cron-driven scheduler that fires enabled routines.
//!
//! Transport-neutral: the session-dispatch step goes through
//! [`RoutineDispatcher`]; activity creation through [`ActivitySurface`]
//! (see `runner.rs`). Timezone resolution: every routine fires in the user's
//! `default_tz` preference (a single account-wide zone), falling back to UTC.

use crate::routines::{
    self,
    runner::{run_routine, ActivitySurface, RoutineDispatcher},
    types::Routine,
};
use chrono::{DateTime, Utc};
use chrono_tz::Tz;
use cron::Schedule;
use houston_ui_events::{DynEventSink, HoustonEvent};
use std::collections::HashMap;
use std::path::PathBuf;
use std::str::FromStr;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{watch, Mutex};

/// Upper bound on a single sleep in the cron wait loop.
///
/// A scheduled fire can be a whole day out, but we must never wait for it in one
/// long sleep. `tokio::time::sleep` runs on the monotonic clock, and on macOS
/// that clock *stops while the machine is asleep* (App Nap, a closed lid, idle
/// suspend). One multi-hour sleep therefore undercounts wall-clock time by the
/// suspend duration: the routine fires late by however long the Mac napped, and
/// across an overnight suspend it can miss the day entirely with no run ever
/// recorded (HOU-541). Capping each sleep forces the loop to re-read the wall
/// clock at least this often, so after a wake an overdue fire is noticed within
/// `MAX_TICK` and caught up.
const MAX_TICK: Duration = Duration::from_secs(30);

/// One decision of the cron wait loop, split out so the suspend-safe timing can
/// be unit-tested without real clocks or real time passing.
#[derive(Debug, PartialEq, Eq)]
enum Tick {
    /// `now` has reached or passed the scheduled instant — fire the routine.
    Fire,
    /// Not due yet — sleep this long (never more than `MAX_TICK`) and re-check.
    Sleep(Duration),
}

/// Decide what the wait loop should do given the current wall-clock `now` and
/// the `next` scheduled instant. Fires when due *or overdue* (the overdue branch
/// is the catch-up after a suspend that slept past the instant); otherwise naps
/// until `next`, capped at `max` so a single wait can never outlast a system
/// suspend.
fn tick(now: DateTime<Utc>, next: DateTime<Utc>, max: Duration) -> Tick {
    match next.signed_duration_since(now).to_std() {
        // Strictly in the future: nap until it, but no longer than `max`.
        Ok(remaining) if !remaining.is_zero() => Tick::Sleep(remaining.min(max)),
        // Zero (`to_std` -> Ok(0)) or negative (`to_std` -> Err): due / overdue.
        _ => Tick::Fire,
    }
}

/// A spawned cron task plus the signature it was spawned for. The signature
/// captures everything that determines *when* the job fires — the schedule and
/// the resolved timezone — so [`AgentScheduler::sync`] can tell a real timing
/// change from a no-op and re-spawn only when needed. Without it, an edited
/// schedule was silently ignored: the job stayed keyed by routine id alone and
/// the spawn loop skipped it because a job already existed (HOU-455).
struct CronJob {
    handle: tokio::task::JoinHandle<()>,
    signature: String,
}

/// Per-agent bundle of cron tasks.
pub struct AgentScheduler {
    agent_path: String,
    default_tz: String,
    jobs: HashMap<String, CronJob>,
    shutdown_tx: watch::Sender<bool>,
    events: DynEventSink,
    dispatcher: Arc<dyn RoutineDispatcher>,
    surface: Arc<dyn ActivitySurface>,
}

impl AgentScheduler {
    pub fn new(
        agent_path: &str,
        default_tz: &str,
        events: DynEventSink,
        dispatcher: Arc<dyn RoutineDispatcher>,
        surface: Arc<dyn ActivitySurface>,
    ) -> Self {
        let (shutdown_tx, _) = watch::channel(false);
        Self {
            agent_path: agent_path.to_string(),
            default_tz: default_tz.to_string(),
            jobs: HashMap::new(),
            shutdown_tx,
            events,
            dispatcher,
            surface,
        }
    }

    pub fn agent_path(&self) -> &str {
        &self.agent_path
    }

    pub fn set_default_tz(&mut self, tz: &str) {
        // Just record it; the next `sync()` re-spawns every job (the resolved
        // timezone is account-wide, so a change moves every routine's fire
        // time and the job signature shifts for all of them).
        self.default_tz = tz.to_string();
    }

    /// Read routines from disk and reconcile cron tasks: spawn newly enabled
    /// ones, abort removed or disabled ones, and re-spawn any whose schedule or
    /// timezone changed since it was started.
    pub fn sync(&mut self) {
        let dir = crate::routines::runner::expand_tilde(&PathBuf::from(&self.agent_path));
        let routines = routines::list(&dir).unwrap_or_default();

        // Desired job signatures, keyed by routine id, for every enabled
        // routine. The signature folds in the schedule and the resolved
        // timezone so an edit to either is detected as a change.
        let desired: HashMap<String, String> = routines
            .iter()
            .filter(|r| r.enabled)
            .map(|r| (r.id.clone(), self.job_signature(r)))
            .collect();

        // Drop jobs that are gone, disabled, OR whose signature changed (edited
        // schedule / timezone). The signature mismatch is the HOU-455 fix: a
        // live job for an edited routine must be torn down so the spawn loop
        // below re-creates it with the new timing.
        let to_remove: Vec<String> = self
            .jobs
            .iter()
            .filter(|(id, job)| desired.get(*id).map_or(true, |sig| sig != &job.signature))
            .map(|(id, _)| id.clone())
            .collect();
        for id in to_remove {
            if let Some(job) = self.jobs.remove(&id) {
                job.handle.abort();
                tracing::info!("[routines] Stopped cron for routine {id}");
            }
        }

        for routine in routines.iter().filter(|r| r.enabled) {
            // Anything still present here has a matching signature (changed ones
            // were removed above); skip it so we don't churn the task.
            if self.jobs.contains_key(&routine.id) {
                continue;
            }
            match self.spawn_cron(routine) {
                Ok(handle) => {
                    tracing::info!(
                        "[routines] Started cron for '{}' ({} @ {})",
                        routine.name,
                        routine.schedule,
                        self.resolve_tz().name(),
                    );
                    let signature = desired
                        .get(&routine.id)
                        .cloned()
                        .unwrap_or_else(|| self.job_signature(routine));
                    self.jobs
                        .insert(routine.id.clone(), CronJob { handle, signature });
                }
                Err(e) => tracing::error!(
                    "[routines] Failed to start cron for '{}': {e}",
                    routine.name
                ),
            }
        }
    }

    /// Signature that determines when a routine's cron task fires: its schedule
    /// plus the resolved timezone. Two routines with the same signature fire at
    /// the same instants, so `sync` only re-spawns when this string changes.
    fn job_signature(&self, routine: &Routine) -> String {
        format!("{}|{}", routine.schedule, self.resolve_tz().name())
    }

    /// The account-wide zone every routine fires in. Falls back to UTC when the
    /// preference is empty or names an unknown zone.
    fn resolve_tz(&self) -> Tz {
        let candidate = self.default_tz.trim();
        match Tz::from_str(candidate) {
            Ok(tz) => tz,
            Err(_) => {
                tracing::warn!(
                    "[routines] Unknown account timezone '{candidate}', falling back to UTC",
                );
                Tz::UTC
            }
        }
    }

    fn spawn_cron(&self, routine: &Routine) -> Result<tokio::task::JoinHandle<()>, String> {
        // 5-field standard cron → 7-field (seconds + year), with the
        // day-of-week field translated into the `cron` crate's numbering.
        // See `cron_compat` for why the verbatim string fires on the wrong day.
        let cron_7 = crate::routines::cron_compat::to_engine_cron(&routine.schedule);
        let schedule = Schedule::from_str(&cron_7)
            .map_err(|e| format!("invalid cron '{}': {e}", routine.schedule))?;

        let tz = self.resolve_tz();
        let agent_path = self.agent_path.clone();
        let routine_id = routine.id.clone();
        let events = self.events.clone();
        let dispatcher = self.dispatcher.clone();
        let surface = self.surface.clone();
        let mut shutdown_rx = self.shutdown_tx.subscribe();

        Ok(tokio::spawn(async move {
            // The instant we're currently waiting to fire. Re-armed from the
            // schedule after every fire. `upcoming` is "strictly after now", so
            // once a fire has happened (now has passed the old instant) it
            // yields the next *future* instant — which collapses every instant
            // skipped during a long suspend into a single catch-up rather than
            // replaying the whole backlog on wake. It is computed once and held:
            // recomputing it mid-wait would step past the very instant we are
            // waiting for the moment `now` reaches it.
            let mut next = match schedule.upcoming(tz).next() {
                Some(t) => t,
                None => return,
            };

            loop {
                // Sleep toward `next` in capped chunks (see `MAX_TICK`) so the
                // wait re-reads the wall clock often enough to survive a system
                // suspend; fall through to fire as soon as the clock has reached
                // or passed the instant.
                if let Tick::Sleep(nap) = tick(Utc::now(), next.with_timezone(&Utc), MAX_TICK) {
                    tokio::select! {
                        _ = tokio::time::sleep(nap) => {}
                        _ = shutdown_rx.changed() => {
                            if *shutdown_rx.borrow() {
                                return;
                            }
                        }
                    }
                    continue;
                }

                tracing::info!(
                    "[routines] Cron fired for routine {routine_id} at {} ({tz})",
                    Utc::now().to_rfc3339()
                );

                match run_routine(
                    events.clone(),
                    dispatcher.clone(),
                    surface.clone(),
                    &agent_path,
                    &routine_id,
                )
                .await
                {
                    Ok(()) => {}
                    // The previous run of THIS routine is still in flight when
                    // the next tick landed — expected dedup, not an error.
                    Err(crate::CoreError::Conflict(msg)) => {
                        tracing::info!(
                            "[routines] skipped cron fire for {routine_id}: {msg}"
                        );
                    }
                    Err(e) => {
                        tracing::error!(
                            "[routines] Error running routine {routine_id}: {e}"
                        );
                    }
                }

                // Re-arm for the next future instant. Done after the run so an
                // overrunning routine can't immediately re-fire its own slot.
                next = match schedule.upcoming(tz).next() {
                    Some(t) => t,
                    None => return,
                };
            }
        }))
    }

    pub fn shutdown(&mut self) {
        let _ = self.shutdown_tx.send(true);
        for (id, job) in self.jobs.drain() {
            job.handle.abort();
            tracing::info!("[routines] Stopped cron for routine {id}");
        }
    }
}

/// Managed state: one scheduler per agent path. Cheap to clone via `Arc`.
#[derive(Default)]
pub struct RoutineSchedulerState(pub Arc<Mutex<HashMap<String, AgentScheduler>>>);

impl RoutineSchedulerState {
    /// Start (or re-sync) the scheduler for a given agent path. Returns the
    /// resolved default timezone.
    pub async fn start_agent(
        &self,
        agent_path: &str,
        default_tz: &str,
        events: DynEventSink,
        dispatcher: Arc<dyn RoutineDispatcher>,
        surface: Arc<dyn ActivitySurface>,
    ) {
        let mut guard = self.0.lock().await;
        match guard.get_mut(agent_path) {
            Some(existing) => {
                existing.set_default_tz(default_tz);
                existing.sync();
            }
            None => {
                // First-time start for this agent in this engine process —
                // sweep any `status="running"` rows left behind by a
                // previous run that didn't reach a terminal state (engine
                // crash, OS kill). Without this, the in-flight precondition
                // in `run_routine` would block every future `run-now`.
                let dir = crate::routines::runner::expand_tilde(
                    &std::path::PathBuf::from(agent_path),
                );
                match crate::routines::runs::sweep_orphan_running(&dir) {
                    Ok(0) => {}
                    Ok(n) => {
                        tracing::warn!(
                            "[routines] swept {n} orphan running run(s) for agent {agent_path}"
                        );
                        events.emit(HoustonEvent::RoutineRunsChanged {
                            agent_path: agent_path.to_string(),
                        });
                    }
                    Err(e) => tracing::error!(
                        "[routines] orphan sweep failed for {agent_path}: {e}"
                    ),
                }

                let mut sched =
                    AgentScheduler::new(agent_path, default_tz, events, dispatcher, surface);
                sched.sync();
                guard.insert(agent_path.to_string(), sched);
            }
        }
    }

    pub async fn stop_agent(&self, agent_path: &str) {
        let mut guard = self.0.lock().await;
        if let Some(mut sched) = guard.remove(agent_path) {
            sched.shutdown();
        }
    }

    pub async fn stop_all(&self) {
        let mut guard = self.0.lock().await;
        for (_, mut sched) in guard.drain() {
            sched.shutdown();
        }
    }

    pub async fn sync_agent(&self, agent_path: &str) {
        let mut guard = self.0.lock().await;
        if let Some(sched) = guard.get_mut(agent_path) {
            sched.sync();
        }
    }

    pub async fn update_default_tz(&self, tz: &str) {
        let mut guard = self.0.lock().await;
        for sched in guard.values_mut() {
            sched.set_default_tz(tz);
            sched.sync();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;
    use crate::routines::create;
    use crate::routines::runner::{DispatchContext, DispatchOutcome};
    use crate::routines::types::{NewRoutine, RoutineChatMode};
    use async_trait::async_trait;
    use houston_ui_events::NoopEventSink;
    use std::path::Path;
    use tempfile::TempDir;

    struct NoopDispatch;
    #[async_trait]
    impl RoutineDispatcher for NoopDispatch {
        async fn dispatch(&self, _ctx: DispatchContext<'_>) -> DispatchOutcome {
            DispatchOutcome::default()
        }
    }
    struct NoopSurface;
    impl ActivitySurface for NoopSurface {
        fn surface(
            &self,
            _wd: &Path,
            _t: &str,
            _d: &str,
            _s: &str,
            _r: &str,
            _rr: &str,
        ) -> Result<String, String> {
            Ok("x".into())
        }
    }

    fn mk(name: &str, enabled: bool) -> NewRoutine {
        NewRoutine {
            name: name.into(),
            description: "".into(),
            prompt: "p".into(),
            schedule: "0 9 * * *".into(),
            enabled,
            suppress_when_silent: true,
            chat_mode: RoutineChatMode::Shared,
            integrations: vec![],
            provider: None,
            model: None,
            effort: None,
        }
    }

    #[tokio::test]
    async fn sunday_routine_spawns_a_job() {
        // Regression for #389: a Sunday schedule is `0` in standard cron, which
        // the `cron` crate rejected outright (its day-of-week minimum is 1), so
        // `spawn_cron` errored and the routine silently never fired. The
        // dow-normalization shim now maps `0` → `1` and the job spawns.
        let d = TempDir::new().unwrap();
        let agent = d.path().to_string_lossy().to_string();

        let mut sunday = mk("sunday", true);
        sunday.schedule = "0 9 * * 0".into();
        create(d.path(), sunday).unwrap();

        let mut sched = AgentScheduler::new(
            &agent,
            "UTC",
            Arc::new(NoopEventSink),
            Arc::new(NoopDispatch),
            Arc::new(NoopSurface),
        );
        sched.sync();
        assert_eq!(sched.jobs.len(), 1);
        sched.shutdown();
    }

    #[tokio::test]
    async fn editing_schedule_respawns_the_cron_job() {
        // HOU-455: a routine's schedule was being changed on disk but the live
        // cron job kept firing on the OLD schedule (or never, if the old time
        // had passed) because `sync` keyed jobs by id alone and skipped any
        // routine that already had a job. Editing the schedule must re-spawn the
        // job so the new timing takes effect.
        use crate::routines::{types::RoutineUpdate, update};

        let d = TempDir::new().unwrap();
        let agent = d.path().to_string_lossy().to_string();
        let r = create(d.path(), mk("editable", true)).unwrap(); // "0 9 * * *"

        let mut sched = AgentScheduler::new(
            &agent,
            "UTC",
            Arc::new(NoopEventSink),
            Arc::new(NoopDispatch),
            Arc::new(NoopSurface),
        );
        sched.sync();
        let before = sched.jobs.get(&r.id).expect("job spawned").signature.clone();
        assert_eq!(before, "0 9 * * *|UTC");

        // Edit the schedule on disk, then re-sync as the route handler does.
        update(
            d.path(),
            &r.id,
            RoutineUpdate {
                schedule: Some("30 14 * * 5".into()),
                ..Default::default()
            },
        )
        .unwrap();
        sched.sync();

        assert_eq!(sched.jobs.len(), 1, "still exactly one job after the edit");
        let after = sched.jobs.get(&r.id).expect("job still present").signature.clone();
        assert_eq!(
            after, "30 14 * * 5|UTC",
            "the live job now carries the edited schedule",
        );
        assert_ne!(before, after, "schedule edit must change the job signature");
        sched.shutdown();
    }

    #[tokio::test]
    async fn changing_account_tz_respawns_every_job() {
        // Sibling of the schedule-edit case: the timezone is now account-wide,
        // so changing `default_tz` shifts *when* every routine fires. The next
        // sync must re-spawn the job even though the cron string is untouched.
        let d = TempDir::new().unwrap();
        let agent = d.path().to_string_lossy().to_string();
        let r = create(d.path(), mk("tz-edit", true)).unwrap();

        let mut sched = AgentScheduler::new(
            &agent,
            "UTC",
            Arc::new(NoopEventSink),
            Arc::new(NoopDispatch),
            Arc::new(NoopSurface),
        );
        sched.sync();
        let before = sched.jobs.get(&r.id).unwrap().signature.clone();
        assert_eq!(before, "0 9 * * *|UTC");

        sched.set_default_tz("America/Bogota");
        sched.sync();

        let after = sched.jobs.get(&r.id).unwrap().signature.clone();
        assert_eq!(after, "0 9 * * *|America/Bogota");
        assert_ne!(before, after);
        sched.shutdown();
    }

    #[tokio::test]
    async fn unchanged_routine_keeps_its_job_across_syncs() {
        // The flip side of the respawn fix: a no-op sync (nothing edited) must
        // NOT churn the job, or every periodic re-sync would needlessly tear
        // down and re-create live cron tasks.
        let d = TempDir::new().unwrap();
        let agent = d.path().to_string_lossy().to_string();
        let r = create(d.path(), mk("steady", true)).unwrap();

        let mut sched = AgentScheduler::new(
            &agent,
            "UTC",
            Arc::new(NoopEventSink),
            Arc::new(NoopDispatch),
            Arc::new(NoopSurface),
        );
        sched.sync();
        let first_id = sched.jobs.get(&r.id).unwrap().handle.id();

        sched.sync(); // no changes on disk

        assert_eq!(sched.jobs.len(), 1);
        assert_eq!(
            sched.jobs.get(&r.id).unwrap().handle.id(),
            first_id,
            "an unchanged routine must keep the very same task, not be re-spawned",
        );
        sched.shutdown();
    }

    #[tokio::test]
    async fn sync_tracks_enabled_routines_only() {
        let d = TempDir::new().unwrap();
        let agent = d.path().to_string_lossy().to_string();

        create(d.path(), mk("A", true)).unwrap();
        create(d.path(), mk("B", true)).unwrap();
        create(d.path(), mk("C", false)).unwrap();

        let mut sched = AgentScheduler::new(
            &agent,
            "UTC",
            Arc::new(NoopEventSink),
            Arc::new(NoopDispatch),
            Arc::new(NoopSurface),
        );
        sched.sync();
        assert_eq!(sched.jobs.len(), 2);
        sched.shutdown();
        assert_eq!(sched.jobs.len(), 0);
    }

    #[tokio::test]
    async fn sync_rejects_invalid_cron_gracefully() {
        let d = TempDir::new().unwrap();
        let agent = d.path().to_string_lossy().to_string();

        create(
            d.path(),
            NewRoutine {
                name: "bad".into(),
                description: "".into(),
                prompt: "p".into(),
                schedule: "not a cron".into(),
                enabled: true,
                suppress_when_silent: true,
                chat_mode: RoutineChatMode::Shared,
                integrations: vec![],
                provider: None,
                model: None,
                effort: None,
            },
        )
        .unwrap();

        let mut sched = AgentScheduler::new(
            &agent,
            "UTC",
            Arc::new(NoopEventSink),
            Arc::new(NoopDispatch),
            Arc::new(NoopSurface),
        );
        sched.sync();
        assert_eq!(sched.jobs.len(), 0);
    }

    #[tokio::test]
    async fn account_tz_parses() {
        let d = TempDir::new().unwrap();
        let agent = d.path().to_string_lossy().to_string();

        let r = create(d.path(), mk("bogota", true)).unwrap();

        let mut sched = AgentScheduler::new(
            &agent,
            "America/Bogota",
            Arc::new(NoopEventSink),
            Arc::new(NoopDispatch),
            Arc::new(NoopSurface),
        );
        sched.sync();
        assert_eq!(sched.jobs.len(), 1);
        assert_eq!(
            sched.jobs.get(&r.id).unwrap().signature,
            "0 9 * * *|America/Bogota",
            "the routine fires in the account zone",
        );
        sched.shutdown();
    }

    #[tokio::test]
    async fn unknown_account_tz_falls_back_to_utc_without_panic() {
        let d = TempDir::new().unwrap();
        let agent = d.path().to_string_lossy().to_string();

        let r = create(d.path(), mk("bogus", true)).unwrap();

        let mut sched = AgentScheduler::new(
            &agent,
            "Not/A_Tz",
            Arc::new(NoopEventSink),
            Arc::new(NoopDispatch),
            Arc::new(NoopSurface),
        );
        sched.sync();
        assert_eq!(sched.jobs.len(), 1);
        assert_eq!(
            sched.jobs.get(&r.id).unwrap().signature,
            "0 9 * * *|UTC",
            "an unknown account zone resolves to UTC, not a panic",
        );
        sched.shutdown();
    }

    #[tokio::test]
    async fn multi_agent_state_keeps_schedulers_separate() {
        let d1 = TempDir::new().unwrap();
        let d2 = TempDir::new().unwrap();
        create(d1.path(), mk("x", true)).unwrap();
        create(d2.path(), mk("y", true)).unwrap();
        create(d2.path(), mk("z", true)).unwrap();

        let state = RoutineSchedulerState::default();
        state
            .start_agent(
                &d1.path().to_string_lossy(),
                "UTC",
                Arc::new(NoopEventSink),
                Arc::new(NoopDispatch),
                Arc::new(NoopSurface),
            )
            .await;
        state
            .start_agent(
                &d2.path().to_string_lossy(),
                "UTC",
                Arc::new(NoopEventSink),
                Arc::new(NoopDispatch),
                Arc::new(NoopSurface),
            )
            .await;
        {
            let g = state.0.lock().await;
            assert_eq!(g.len(), 2);
            assert_eq!(g.get(&*d1.path().to_string_lossy()).unwrap().jobs.len(), 1);
            assert_eq!(g.get(&*d2.path().to_string_lossy()).unwrap().jobs.len(), 2);
        }
        state.stop_all().await;
        assert!(state.0.lock().await.is_empty());
    }

    // ---- suspend-safe wait loop (HOU-541) ----------------------------------
    // These drive `tick` with synthetic clocks: no real time passes, so the
    // timing policy is asserted deterministically. The bug was a single
    // multi-hour `tokio::time::sleep` whose monotonic timer macOS freezes
    // during system sleep, so the routine fired late or — across an overnight
    // suspend — never that day, with no run recorded.

    #[test]
    fn tick_far_future_fire_is_capped_to_max_tick() {
        // A fire ~23h out must become a short capped nap, never one 23h sleep:
        // that single monotonic sleep is exactly what a suspend freezes.
        let now = Utc.with_ymd_and_hms(2026, 6, 19, 1, 0, 0).unwrap();
        let next = now + chrono::Duration::hours(23);
        assert_eq!(tick(now, next, MAX_TICK), Tick::Sleep(MAX_TICK));
    }

    #[test]
    fn tick_within_cap_sleeps_the_exact_remainder() {
        // Closer than the cap: wait precisely the remainder, don't fire early.
        let now = Utc.with_ymd_and_hms(2026, 6, 19, 12, 59, 55).unwrap();
        let next = Utc.with_ymd_and_hms(2026, 6, 19, 13, 0, 0).unwrap();
        assert_eq!(tick(now, next, MAX_TICK), Tick::Sleep(Duration::from_secs(5)));
    }

    #[test]
    fn tick_due_now_fires() {
        let now = Utc.with_ymd_and_hms(2026, 6, 19, 13, 0, 0).unwrap();
        assert_eq!(tick(now, now, MAX_TICK), Tick::Fire);
    }

    #[test]
    fn tick_overdue_after_suspend_fires_immediately() {
        // The HOU-541 case: the Mac slept past 08:00 Bogota (13:00 UTC) and the
        // loop only re-reads the clock on wake, hours later. The overdue instant
        // must fire (catch up), not be skipped — skipping is why no run was ever
        // recorded that morning.
        let next = Utc.with_ymd_and_hms(2026, 6, 19, 13, 0, 0).unwrap();
        let woke = next + chrono::Duration::hours(9);
        assert_eq!(tick(woke, next, MAX_TICK), Tick::Fire);
    }
}
