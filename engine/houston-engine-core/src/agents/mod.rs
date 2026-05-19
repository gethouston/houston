//! Typed read/write operations for `.houston/` agent files.
//!
//! Every Houston agent project stores agent-visible data in a `.houston/` folder
//! alongside the project root. This module provides standalone CRUD functions
//! plus the [`AgentStore`] convenience facade for those files.
//!
//! Relocated from `app/houston-tauri/src/agent_store/` as part of the engine
//! standalone migration (Phase 2). Transport-neutral — REST routes, CLI tools,
//! tests, and the Tauri adapter all consume this module.
//!
//! The cross-agent conversation listing lives one level up
//! (`houston_engine_core::conversations`) and is already REST-exposed under
//! `/v1/conversations/*`. This module intentionally does not duplicate it.

pub mod activity;
pub mod config;
pub mod files;
mod learnings_context;
pub mod prompt;
pub mod routine_runs;
pub mod routines;
pub mod store;
pub mod types;

pub use types::*;

use crate::error::CoreResult;
use std::path::{Path, PathBuf};

/// File-backed store for `.houston/` agent data.
///
/// All write operations use atomic temp-file + rename to prevent corruption.
pub struct AgentStore {
    root: PathBuf,
}

impl AgentStore {
    pub fn new(project_folder: &Path) -> Self {
        Self {
            root: project_folder.to_path_buf(),
        }
    }

    pub fn ensure_houston_dir(&self) -> CoreResult<()> {
        store::ensure_houston_dir(&self.root)
    }

    // -- Activity --
    pub fn list_activity(&self) -> CoreResult<Vec<Activity>> {
        activity::list(&self.root)
    }
    pub fn create_activity(&self, input: NewActivity) -> CoreResult<Activity> {
        self.ensure_houston_dir()?;
        activity::create(&self.root, input)
    }
    pub fn update_activity(&self, id: &str, updates: ActivityUpdate) -> CoreResult<Activity> {
        activity::update(&self.root, id, updates)
    }
    pub fn delete_activity(&self, id: &str) -> CoreResult<()> {
        activity::delete(&self.root, id)
    }

    // -- Routines --
    pub fn list_routines(&self) -> CoreResult<Vec<Routine>> {
        routines::list(&self.root)
    }
    pub fn create_routine(&self, input: NewRoutine) -> CoreResult<Routine> {
        self.ensure_houston_dir()?;
        routines::create(&self.root, input)
    }
    pub fn update_routine(&self, id: &str, updates: RoutineUpdate) -> CoreResult<Routine> {
        routines::update(&self.root, id, updates)
    }
    pub fn delete_routine(&self, id: &str) -> CoreResult<()> {
        routines::delete(&self.root, id)
    }

    // -- Routine Runs --
    pub fn list_routine_runs(&self) -> CoreResult<Vec<RoutineRun>> {
        routine_runs::list(&self.root)
    }
    pub fn list_routine_runs_for(&self, routine_id: &str) -> CoreResult<Vec<RoutineRun>> {
        routine_runs::list_for_routine(&self.root, routine_id)
    }
    pub fn create_routine_run(&self, routine_id: &str) -> CoreResult<RoutineRun> {
        self.ensure_houston_dir()?;
        routine_runs::create(&self.root, routine_id)
    }
    pub fn update_routine_run(
        &self,
        id: &str,
        updates: RoutineRunUpdate,
    ) -> CoreResult<RoutineRun> {
        routine_runs::update(&self.root, id, updates)
    }

    // -- Config --
    pub fn read_config(&self) -> CoreResult<ProjectConfig> {
        config::read(&self.root)
    }
    pub fn write_config(&self, cfg: &ProjectConfig) -> CoreResult<()> {
        config::write(&self.root, cfg)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn tmp() -> TempDir {
        TempDir::new().unwrap()
    }

    #[test]
    fn activity_lifecycle() {
        let d = tmp();
        let s = AgentStore::new(d.path());
        s.ensure_houston_dir().unwrap();
        assert!(s.list_activity().unwrap().is_empty());
        let a = s
            .create_activity(NewActivity {
                title: "first".into(),
                description: "desc".into(),
                agent: Some("execution".into()),
                worktree_path: None,
                provider: None,
                model: None,
            })
            .unwrap();
        assert_eq!(a.title, "first");
        assert_eq!(a.status, "running");
        assert!(s.list_activity().unwrap().len() == 1);
        let updated = s
            .update_activity(
                &a.id,
                ActivityUpdate {
                    status: Some("completed".into()),
                    ..Default::default()
                },
            )
            .unwrap();
        assert_eq!(updated.status, "completed");
        s.delete_activity(&a.id).unwrap();
        assert!(s.list_activity().unwrap().is_empty());
    }

    #[test]
    fn per_mission_model_isolation() {
        let d = tmp();
        let s = AgentStore::new(d.path());
        s.ensure_houston_dir().unwrap();
        let a1 = s
            .create_activity(NewActivity {
                title: "mission-one".into(),
                description: String::new(),
                provider: Some("anthropic".into()),
                model: Some("opus".into()),
                ..Default::default()
            })
            .unwrap();
        let a2 = s
            .create_activity(NewActivity {
                title: "mission-two".into(),
                description: String::new(),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(a1.provider.as_deref(), Some("anthropic"));
        assert_eq!(a1.model.as_deref(), Some("opus"));
        assert_eq!(a2.provider, None);
        assert_eq!(a2.model, None);

        s.update_activity(
            &a2.id,
            ActivityUpdate {
                provider: Some("openai".into()),
                model: Some("gpt-5.4".into()),
                ..Default::default()
            },
        )
        .unwrap();

        let items = s.list_activity().unwrap();
        let r1 = items.iter().find(|a| a.id == a1.id).unwrap();
        let r2 = items.iter().find(|a| a.id == a2.id).unwrap();
        assert_eq!(r1.provider.as_deref(), Some("anthropic"));
        assert_eq!(r1.model.as_deref(), Some("opus"));
        assert_eq!(r2.provider.as_deref(), Some("openai"));
        assert_eq!(r2.model.as_deref(), Some("gpt-5.4"));
    }

    #[test]
    fn routine_lifecycle() {
        let d = tmp();
        let s = AgentStore::new(d.path());
        s.ensure_houston_dir().unwrap();
        let r = s
            .create_routine(NewRoutine {
                name: "morning".into(),
                description: String::new(),
                prompt: "do the thing".into(),
                schedule: "0 9 * * *".into(),
                enabled: true,
                suppress_when_silent: true,
                integrations: vec![],
            })
            .unwrap();
        assert_eq!(s.list_routines().unwrap().len(), 1);

        let run = s.create_routine_run(&r.id).unwrap();
        assert_eq!(run.routine_id, r.id);
        assert!(run.session_key.starts_with(&format!("routine-{}-run-", r.id)));
        assert_eq!(s.list_routine_runs_for(&r.id).unwrap().len(), 1);

        let upd = s
            .update_routine_run(
                &run.id,
                RoutineRunUpdate {
                    status: Some("surfaced".into()),
                    ..Default::default()
                },
            )
            .unwrap();
        assert_eq!(upd.status, "surfaced");

        s.delete_routine(&r.id).unwrap();
        assert!(s.list_routines().unwrap().is_empty());
    }

    #[test]
    fn routine_runs_pruned_at_50() {
        let d = tmp();
        let s = AgentStore::new(d.path());
        s.ensure_houston_dir().unwrap();
        for _ in 0..60 {
            s.create_routine_run("rid").unwrap();
        }
        assert_eq!(s.list_routine_runs_for("rid").unwrap().len(), 50);
    }

    #[test]
    fn config_round_trip() {
        let d = tmp();
        let s = AgentStore::new(d.path());
        s.ensure_houston_dir().unwrap();
        let cfg = ProjectConfig {
            name: "alpha".into(),
            provider: Some("anthropic".into()),
            model: Some("sonnet".into()),
            effort: None,
            extra: serde_json::Map::new(),
        };
        s.write_config(&cfg).unwrap();
        let read = s.read_config().unwrap();
        assert_eq!(read.name, "alpha");
        assert_eq!(read.provider.as_deref(), Some("anthropic"));
    }
}
