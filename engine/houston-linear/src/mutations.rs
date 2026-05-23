//! Typed GraphQL mutations against Linear's schema.
//!
//! Populated in C1.5 via `cynic` codegen. The mutations Houston writes
//! to Linear are deliberately narrow — the engine never replicates
//! Linear's UI; it only writes the state Houston is canonical for:
//!
//! - `issueUpdate` — state transitions, assignee change (Houston-side
//!   writeback after a session completes).
//! - `commentCreate` — append a session-completion summary to the
//!   issue thread.
//! - `agentActivityCreate` — AppUser-side AgentSession event egress
//!   (working / thought / action / complete / error).
//! - `agentSessionRegister` — one-time AppUser registration on first
//!   OAuth install.
//!
//! Every mutation includes the prior-known `updatedAt` for optimistic
//! concurrency. Linear is canonical for state; Houston's mirror is a
//! projection. Conflicts re-converge via webhook reconciliation.
