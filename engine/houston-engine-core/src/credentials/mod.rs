//! Beltic verifiable-credentials persistence inside `.houston/credentials/`.
//!
//! Each agent stores its credential history as an append-only list, newest
//! last. The "current" credential is the most-recent row with
//! `status == Active`. Older rows stay on disk for audit — Beltic revokes
//! don't delete the credential, they flip its status — so the agent has a
//! complete chain of issuance/revocation visible to it via its own
//! `.houston/` files (files-first reactivity rule).
//!
//! The same shape backs the workspace-level identity credential: the
//! workspace-scoped helpers in [`identity`] write to a sibling folder at
//! the workspace root instead of the agent root.

pub mod agent_did;
pub mod evidence_store;
pub mod identity;
pub mod store;
pub mod types;

pub use store::{
    active, find_by_credential_id, list, save, update_status,
};
pub use types::{CredentialStatus, NewCredential, VerifiableCredential};
