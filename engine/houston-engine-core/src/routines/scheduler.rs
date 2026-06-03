//! Cron-driven scheduler that fires enabled routines.
//!
//! Transport-neutral: the session-dispatch step goes through
//! [`RoutineDispatcher`]; activity creation through [`ActivitySurface`]
//! (see `runner.rs`). Timezone resolution: per-routine override wins, then
//! `default_tz` (user preference), then UTC.

use crate::routines::{
    self,
    runner::{run_routine, ActivitySurface, RoutineDispatcher},
    types::Routine,
};
use chrono::Utc;
use chrono_tz::Tz;
use cron::Schedule;
use houston_ui_events::{DynEventSink, HoustonEvent};
use std::collections::HashMap;
use std::path::PathBuf;
use std::str::FromStr;
use std::sync::Arc;
use tokio::sync::{watch, Mutex};

/// Per-agent bundle of cron tasks.
pub struct AgentScheduler {
    agent_path: String,
    default_tz: String,
    jobs: HashMap<String, tokio::task::JoinHandle<()>>,
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
        if self.default_tz != tz {
            self.default_tz = tz.to_string();
            // Respawn all jobs so new TZ takes effect.
            for (_, handle) in self.jobs.drain() {
                handle.abort();
            }
        }
    }

    /// Read routines from disk and reconcile cron tasks: spawn for newly
    /// enabled ones, abort for removed or disabled ones.
    pub fn sync(&mut self) {
        let dir = crate::routines::runner::expand_tilde(&PathBuf::from(&self.agent_path));
        let routines = routines::list(&dir).unwrap_or_default();

        let active_ids: HashMap<String, String> = routines
            .iter()
            .filter(|r| r.enabled)
            .map(|r| (r.id.clone(), r.schedule.clone()))
            .collect();

        let to_remove: Vec<String> = self
            .jobs
            .keys()
            .filter(|id| !active_ids.contains_key(*id))
            .cloned()
            .collect();
        for id in to_remove {
            if let Some(handle) = self.jobs.remove(&id) {
                handle.abort();
                tracing::info!("[routines] Stopped cron for routine {id}");
            }
        }

        for routine in &routines {
            if !routine.enabled || self.jobs.contains_key(&routine.id) {
                continue;
            }
            match self.spawn_cron(routine) {
                Ok(handle) => {
                    tracing::info!(
                        "[routines] Started cron for '{}' ({} @ {})",
                        routine.name,
                        routine.schedule,
                        self.resolve_tz(routine).name(),
                    );
                    self.jobs.insert(routine.id.clone(), handle);
                }
                Err(e) => tracing::error!(
                    "[routines] Failed to start cron for '{}': {e}",
                    routine.name
                ),
            }
        }
    }

    fn resolve_tz(&self, routine: &Routine) -> Tz {
        let candidate = routine
            .timezone
            .as_deref()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or(&self.default_tz);
        match Tz::from_str(candidate) {
            Ok(tz) => tz,
            Err(_) => {
                tracing::warn!(
                    "[routines] Unknown timezone '{candidate}' for routine '{}', falling back to UTC",
                    routine.name
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

        let tz = self.resolve_tz(routine);
        let agent_path = self.agent_path.clone();
        let routine_id = routine.id.clone();
        let events = self.events.clone();
        let dispatcher = self.dispatcher.clone();
        let surface = self.surface.clone();
        let mut shutdown_rx = self.shutdown_tx.subscribe();

        Ok(tokio::spawn(async move {
            loop {
                let next = match schedule.upcoming(tz).next() {
                    Some(t) => t,
                    None => return,
                };

                let delay = next.with_timezone(&Utc).signed_duration_since(Utc::now());
                let sleep_dur = if delay.num_milliseconds() > 0 {
                    std::time::Duration::from_millis(delay.num_milliseconds() as u64)
                } else {
                    std::time::Duration::from_millis(0)
                };

                tokio::select! {
                    _ = tokio::time::sleep(sleep_dur) => {}
                    _ = shutdown_rx.changed() => {
                        if *shutdown_rx.borrow() {
                            return;
                        }
                    }
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
            }
        }))
    }

    pub fn shutdown(&mut self) {
        let _ = self.shutdown_tx.send(true);
        for (id, handle) in self.jobs.drain() {
            handle.abort();
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
    use crate::routines::create;
    use crate::routines::runner::{DispatchContext, DispatchOutcome};
    use crate::routines::types::NewRoutine;
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

    fn mk(name: &str, enabled: bool, tz: Option<&str>) -> NewRoutine {
        NewRoutine {
            name: name.into(),
            description: "".into(),
            prompt: "p".into(),
            schedule: "0 9 * * *".into(),
            enabled,
            suppress_when_silent: true,
            timezone: tz.map(str::to_string),
            integrations: vec![],
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

        let mut sunday = mk("sunday", true, None);
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
    async fn sync_tracks_enabled_routines_only() {
        let d = TempDir::new().unwrap();
        let agent = d.path().to_string_lossy().to_string();

        create(d.path(), mk("A", true, None)).unwrap();
        create(d.path(), mk("B", true, None)).unwrap();
        create(d.path(), mk("C", false, None)).unwrap();

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
                timezone: None,
                integrations: vec![],
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
    async fn per_routine_tz_override_parses() {
        let d = TempDir::new().unwrap();
        let agent = d.path().to_string_lossy().to_string();

        create(d.path(), mk("bogota", true, Some("America/Bogota"))).unwrap();

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
    async fn unknown_tz_falls_back_to_utc_without_panic() {
        let d = TempDir::new().unwrap();
        let agent = d.path().to_string_lossy().to_string();

        create(d.path(), mk("bogus", true, Some("Not/A_Tz"))).unwrap();

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
    async fn multi_agent_state_keeps_schedulers_separate() {
        let d1 = TempDir::new().unwrap();
        let d2 = TempDir::new().unwrap();
        create(d1.path(), mk("x", true, None)).unwrap();
        create(d2.path(), mk("y", true, None)).unwrap();
        create(d2.path(), mk("z", true, None)).unwrap();

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
}
