//! Shared server state — cheap to clone via `Arc`.

use crate::config::ServerConfig;
use crate::mobile_access::MobileAccessStore;
use anyhow::{Context, Result};
use houston_db::Database;
use houston_engine_core::routines::scheduler::RoutineSchedulerState;
use houston_engine_core::{attachments::AttachmentUploadStore, paths::EnginePaths, EngineState};
use houston_file_watcher::WatcherState;
use houston_tunnel::{TunnelIdentity, TunnelRuntimeState};
use houston_ui_events::{BroadcastEventSink, EventSink, HoustonEvent};
use std::path::Path;
use std::sync::Arc;

/// Server state shared across request handlers.
pub struct ServerState {
    pub config: ServerConfig,
    /// Broadcast channel for WebSocket fanout. Every WS client subscribes.
    pub events: BroadcastEventSink,
    /// Engine runtime container (DB, paths, sinks).
    pub engine: EngineState,
    /// Routine scheduler (per-agent cron). `Option` inside so start/stop can
    /// swap it without dropping the outer state.
    pub routine_scheduler: RoutineSchedulerState,
    /// Agent file watcher.
    pub watcher: WatcherState,
    /// Runtime tunnel state. `None` only while `/allocate` hasn't succeeded
    /// yet (first boot without network). Once allocated, identity is cached in
    /// `tunnel.json` and persists across restarts.
    pub tunnel_runtime: Option<TunnelRuntimeState>,
    /// Stable phone-access secret + device-token minting.
    pub mobile_access: MobileAccessStore,
    /// Pending binary attachment uploads keyed by upload id.
    pub attachment_uploads: AttachmentUploadStore,
}

impl ServerState {
    /// Initialise state with a file-backed DB at `<home>/db/houston.db`.
    ///
    /// `tunnel_identity` is the relay handshake result — `Some` once
    /// `houston_tunnel::ensure` returns, `None` if the first-boot
    /// allocation failed (engine keeps running local-only until the
    /// next boot succeeds).
    pub async fn new(
        config: ServerConfig,
        tunnel_identity: Option<TunnelIdentity>,
    ) -> Result<Self> {
        let db_path = config.home_dir.join("db").join("houston.db");
        let db = Database::connect(&db_path)
            .await
            .context("Failed to open engine DB")?;
        Ok(Self::with_db(config, db, tunnel_identity))
    }

    /// Initialise state with an in-memory DB — for tests.
    pub async fn new_in_memory(config: ServerConfig) -> Result<Self> {
        let db = Database::connect_in_memory()
            .await
            .context("Failed to open in-memory engine DB")?;
        Ok(Self::with_db(config, db, None))
    }

    fn with_db(
        config: ServerConfig,
        db: Database,
        tunnel_identity: Option<TunnelIdentity>,
    ) -> Self {
        let events = BroadcastEventSink::new(1024);
        let paths = EnginePaths::new(config.docs_dir.clone(), config.home_dir.clone());

        // Retire `workspace.provider` / `workspace.model` in favor of
        // per-agent storage. Idempotent — subsequent boots are a no-op.
        // Logged-and-swallowed because a stale workspace default isn't worth
        // failing the engine boot over; the resolver falls back to the
        // platform default if a per-agent config doesn't exist yet.
        if let Err(e) =
            houston_engine_core::workspaces::migrate_workspace_provider_into_agents(paths.docs())
        {
            tracing::warn!("[boot] workspace provider migration failed: {e}");
        }

        let repaired_activities = sweep_orphan_activities(paths.docs(), &events);
        if repaired_activities > 0 {
            tracing::info!("[boot] repaired {repaired_activities} orphan running activity row(s)");
        }

        let repaired_workflow_runs = sweep_orphan_workflow_runs(paths.docs(), &events);
        if repaired_workflow_runs > 0 {
            tracing::info!("[boot] repaired {repaired_workflow_runs} orphan workflow run row(s)");
        }

        let engine = EngineState::new(paths, Arc::new(events.clone()), db.clone())
            .with_app_prompts(
                config.app_system_prompt.clone(),
                config.app_onboarding_prompt.clone(),
            );

        let mobile_access = MobileAccessStore::new(db);
        let tunnel_runtime = tunnel_identity.map(TunnelRuntimeState::new);

        Self {
            config,
            events,
            engine,
            routine_scheduler: RoutineSchedulerState::default(),
            watcher: WatcherState::default(),
            tunnel_runtime,
            mobile_access,
            attachment_uploads: AttachmentUploadStore::default(),
        }
    }
}

pub(crate) fn sweep_orphan_activities(docs_dir: &Path, events: &BroadcastEventSink) -> usize {
    let workspaces = match houston_engine_core::workspaces::list(docs_dir) {
        Ok(workspaces) => workspaces,
        Err(e) => {
            tracing::warn!("[boot] failed to list workspaces for activity sweep: {e}");
            return 0;
        }
    };

    let mut repaired = 0usize;
    for workspace in workspaces {
        let agents = match houston_engine_core::agents_crud::list(docs_dir, &workspace.id) {
            Ok(agents) => agents,
            Err(e) => {
                tracing::warn!(
                    "[boot] failed to list agents for workspace {} during activity sweep: {e}",
                    workspace.id
                );
                continue;
            }
        };

        for agent in agents {
            match houston_engine_core::agents::activity::sweep_orphan_running(Path::new(
                &agent.folder_path,
            )) {
                Ok(0) => {}
                Ok(count) => {
                    repaired += count;
                    events.emit(HoustonEvent::ActivityChanged {
                        agent_path: agent.folder_path.clone(),
                    });
                }
                Err(e) => {
                    tracing::warn!(
                        "[boot] failed to sweep orphan activity rows for {}: {e}",
                        agent.folder_path
                    );
                }
            }
        }
    }

    repaired
}

pub(crate) fn sweep_orphan_workflow_runs(docs_dir: &Path, events: &BroadcastEventSink) -> usize {
    let workspaces = match houston_engine_core::workspaces::list(docs_dir) {
        Ok(workspaces) => workspaces,
        Err(e) => {
            tracing::warn!("[boot] failed to list workspaces for workflow sweep: {e}");
            return 0;
        }
    };

    let mut repaired = 0usize;
    for workspace in workspaces {
        let agents = match houston_engine_core::agents_crud::list(docs_dir, &workspace.id) {
            Ok(agents) => agents,
            Err(e) => {
                tracing::warn!(
                    "[boot] failed to list agents for workspace {} during workflow sweep: {e}",
                    workspace.id
                );
                continue;
            }
        };

        for agent in agents {
            match houston_engine_core::workflows::sweep_orphan_running(Path::new(
                &agent.folder_path,
            )) {
                Ok(0) => {}
                Ok(count) => {
                    repaired += count;
                    events.emit(HoustonEvent::WorkflowRunsChanged {
                        agent_path: agent.folder_path.clone(),
                    });
                }
                Err(e) => {
                    tracing::warn!(
                        "[boot] failed to sweep orphan workflow runs for {}: {e}",
                        agent.folder_path
                    );
                }
            }
        }
    }
    repaired
}

#[cfg(test)]
mod tests {
    use super::*;
    use houston_engine_core::agents::activity;
    use houston_engine_core::agents::types::{ActivityUpdate, NewActivity};
    use houston_engine_core::agents_crud::{self, CreateAgent};
    use houston_engine_core::workspaces::{self, CreateWorkspace};
    use tempfile::TempDir;

    #[test]
    fn boot_sweep_repairs_running_activity_rows_and_emits_changes() {
        let docs = TempDir::new().unwrap();
        let workspace = workspaces::create(
            docs.path(),
            CreateWorkspace {
                name: "Personal".into(),
            },
        )
        .unwrap();
        let agent = agents_crud::create(
            docs.path(),
            &workspace.id,
            CreateAgent {
                name: "PA".into(),
                config_id: "blank".into(),
                color: None,
                claude_md: None,
                installed_path: None,
                seeds: None,
                existing_path: None,
            },
        )
        .unwrap()
        .agent;
        let agent_path = Path::new(&agent.folder_path);
        let running = activity::create(
            agent_path,
            NewActivity {
                title: "ping?".into(),
                description: String::new(),
                agent: None,
                worktree_path: None,
                provider: None,
                model: None,
            },
        )
        .unwrap();
        let waiting = activity::create(
            agent_path,
            NewActivity {
                title: "done".into(),
                description: String::new(),
                agent: None,
                worktree_path: None,
                provider: None,
                model: None,
            },
        )
        .unwrap();
        activity::update(
            agent_path,
            &waiting.id,
            ActivityUpdate {
                status: Some("needs_you".into()),
                ..ActivityUpdate::default()
            },
        )
        .unwrap();

        let events = BroadcastEventSink::new(16);
        let mut rx = events.subscribe();
        let repaired = sweep_orphan_activities(docs.path(), &events);

        assert_eq!(repaired, 1);
        let persisted = activity::list(agent_path).unwrap();
        assert_eq!(
            persisted
                .iter()
                .find(|item| item.id == running.id)
                .expect("running row")
                .status,
            "needs_you"
        );
        assert_eq!(
            persisted
                .iter()
                .find(|item| item.id == waiting.id)
                .expect("waiting row")
                .status,
            "needs_you"
        );

        let event = rx.try_recv().expect("activity change event");
        assert!(
            matches!(event, HoustonEvent::ActivityChanged { agent_path: p } if p == agent.folder_path)
        );
    }
}
