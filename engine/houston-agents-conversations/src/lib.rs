//! Orchestrates multi-session conversation lifecycle for Houston agents.
//!
//! Sits ABOVE `houston-terminal-manager` (raw CLI subprocess) and BELOW the Tauri
//! command layer. Responsibilities:
//!
//! - `session_runner` — spawn a CLI session, stream updates, emit UI events,
//!   optionally persist feed items to the database, track the provider resume
//!   ID.
//! - `session_id_tracker` — per-conversation provider resume ID registry with
//!   disk persistence (`.houston/sessions/{provider}/{key}.sid`).
//! - `session_pids` — map of `session_key → pid` (with cancel tombstones)
//!   so stop requests can kill the right subprocess, even one that spawns
//!   after Stop was pressed.
//! - `process_kill` — escalating, verified termination of a provider
//!   process tree (TERM → KILL on Unix, `taskkill /T /F` on Windows).
//! - `supervisor` — panic-isolating wrapper so one session crashing doesn't
//!   unwind the whole app.

pub mod process_kill;
pub mod session_id_tracker;
pub mod session_pids;
pub mod session_runner;
pub mod supervisor;
