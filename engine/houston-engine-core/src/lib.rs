//! houston-engine-core — runtime container for the Houston Engine.
//!
//! Owns `EngineState` (DB, event sinks, paths) and hosts domain logic that
//! used to live inside `app/houston-tauri/`. Transport-neutral: HTTP routes,
//! CLI tools, tests, and the desktop adapter all consume this crate.

pub mod agent_configs;
pub mod agents;
pub mod agents_crud;
pub mod attachments;
pub mod conversations;
pub mod error;
pub mod file_mutex;
pub mod git_bash;
pub mod paths;
pub mod preferences;
pub mod process_probe;
pub mod provider;
pub mod reaper;
pub mod routines;
pub mod runtime_leases;
pub mod runtime_pids;
pub mod sessions;
pub mod skills;
pub mod state;
pub mod store;
pub mod worktree;
pub mod workspaces;

pub use error::{CoreError, CoreResult};
pub use state::EngineState;
