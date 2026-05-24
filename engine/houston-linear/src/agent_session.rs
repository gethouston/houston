//! Linear's 2026 AppUser + AgentSession protocol — Houston side.
//!
//! Linear delegates work to Houston by assigning an issue (or
//! @-mentioning the AppUser). The OAuth user installed with
//! `app:assignable` + `app:mentionable` scopes IS the AppUser for the
//! org — no separate registration mutation. Houston identifies its
//! AppUser via the viewer query and persists `app_user_id` to
//! `connection.json`.
//!
//! ## Response budget (HARD)
//!
//! Engine MUST emit a `thought` or `response` activity back to Linear
//! within [`crate::AGENT_SESSION_RESPONSE_BUDGET_MS`] of webhook
//! receipt. Missing the budget produces
//! [`LinearError::AgentSessionBudget`].
//!
//! The 5-second budget covers the **first** response. The Houston
//! session itself may run for minutes; subsequent events
//! (`thought`, `action`, `response`, `error`) flow back as work
//! progresses.
//!
//! ## Ingress (Linear → Houston): inbox handoff
//!
//! Webhook deliveries of type `AgentSessionEvent` (action
//! `created` / `prompted`) are written to
//! `<workspace>/.houston/inbox/linear/<session_id>.json` by
//! [`write_inbox_delegation`]. The desktop agent shell picks up via
//! the existing file watcher (per the AI-native-reactivity invariant)
//! and starts a new session with the delegation as the first prompt.
//!
//! Houston-side session lifecycle (routing → start → stream → finish)
//! lives in `houston-engine-core` and is *not* this crate's
//! responsibility — keeping the boundary clean.
//!
//! ## Egress (Houston → Linear): activity poster
//!
//! [`post_activity`] wraps the typed [`crate::mutations::agent_activity`]
//! mutation. Callers (the future engine-core dispatcher) hand a
//! workspace + session id + content kind + body; the function loads
//! the OAuth token, fires the mutation, returns the activity id.

use crate::error::LinearError;
use crate::keychain;
use crate::mutations::agent_activity::{
    self, AgentActivityCreateInput, AgentActivityKind, CreateAgentActivity, CreateAgentActivityVars,
};
use crate::ConnectionMeta;
use crate::LINEAR_GRAPHQL_URL;
use cynic::{GraphQlResponse, MutationBuilder};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// One delegation written to the inbox. Encodes everything the agent
/// shell needs to start a session: the Linear session id (used as the
/// thread id), the issue context, and the initial prompt body.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct InboxDelegation {
    /// Linear's AgentSession UUID — the canonical thread id.
    pub session_id: String,
    /// Linear's issue identifier (`ENG-123`) when the delegation is
    /// scoped to an issue; absent for comment-thread sessions.
    pub issue_identifier: Option<String>,
    /// Linear's issue UUID, when applicable.
    pub issue_id: Option<String>,
    /// Linear's comment UUID, when the session was created on a
    /// comment thread.
    pub comment_id: Option<String>,
    /// First prompt body — what the human user typed (or the issue
    /// description, if assignment-based delegation).
    pub initial_prompt: String,
    /// RFC 3339 — when the webhook was received.
    pub received_at: String,
    /// Linear's `webhookId` for the delivery that triggered this
    /// delegation. Lets the agent dedupe / link back to the raw event.
    pub source_webhook_id: String,
    /// Linear's `action` (`created` / `prompted`) from the webhook.
    pub source_action: String,
}

/// On-disk path for the inbox file. One file per session id; the
/// agent shell consumes + archives.
pub fn inbox_path(workspace_path: &Path, session_id: &str) -> PathBuf {
    workspace_path
        .join(".houston")
        .join("inbox")
        .join("linear")
        .join(format!("{session_id}.json"))
}

/// Write a delegation to the workspace inbox atomically (temp + rename).
///
/// Idempotent — writing the same `session_id` overwrites in place so a
/// `prompted` follow-up replaces the prior `created` payload. The
/// agent shell is expected to read AND archive (the inbox is not a
/// log; it's a courier surface).
pub fn write_inbox_delegation(
    workspace_path: &Path,
    delegation: &InboxDelegation,
) -> Result<(), LinearError> {
    let path = inbox_path(workspace_path, &delegation.session_id);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| LinearError::Io(format!("create inbox dir: {e}")))?;
    }
    let tmp = path.with_extension("json.tmp");
    let json = serde_json::to_string_pretty(delegation).map_err(LinearError::Json)?;
    std::fs::write(&tmp, json)
        .map_err(|e| LinearError::Io(format!("write inbox delegation: {e}")))?;
    std::fs::rename(&tmp, &path)
        .map_err(|e| LinearError::Io(format!("rename inbox delegation: {e}")))?;
    Ok(())
}

/// Post an activity to Linear's AgentSession event stream.
///
/// `workspace_path` resolves the OAuth org + access token; `session_id`
/// is Linear's AgentSession UUID (from the inbox delegation); `kind`
/// + `body` produce the canonical content payload.
///
/// Returns the new activity's Linear UUID for the caller's records.
pub async fn post_activity(
    workspace_path: &Path,
    http: &reqwest::Client,
    session_id: &str,
    kind: AgentActivityKind,
    body: impl Into<String>,
) -> Result<String, LinearError> {
    let meta = ConnectionMeta::load(workspace_path)?;
    let tokens = keychain::load(&meta.org_id)?;

    let vars = CreateAgentActivityVars {
        input: AgentActivityCreateInput {
            agent_session_id: session_id.to_string(),
            content: agent_activity::build_content(kind, body),
        },
    };
    let operation = CreateAgentActivity::build(vars);

    // Manual JSON post — mirrors `queries::viewer::fetch_org_info`.
    // cynic 3's ReqwestExt has been finicky across versions; staying
    // explicit keeps this resilient to crate upgrades. The mutation
    // body is still cynic-typed at compile time via the QueryFragment
    // derive above.
    let response = http
        .post(LINEAR_GRAPHQL_URL)
        .bearer_auth(&tokens.access_token)
        .json(&operation)
        .send()
        .await?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(LinearError::Graphql(format!(
            "agentActivityCreate HTTP {status}: {body}"
        )));
    }

    let parsed: GraphQlResponse<CreateAgentActivity> = response.json().await?;

    if let Some(errors) = parsed.errors {
        if !errors.is_empty() {
            let msg = errors
                .into_iter()
                .map(|e| e.message)
                .collect::<Vec<_>>()
                .join("; ");
            return Err(LinearError::Graphql(msg));
        }
    }

    let payload = parsed
        .data
        .ok_or_else(|| LinearError::SchemaDrift("agentActivityCreate returned no data".into()))?
        .agent_activity_create;

    if !payload.success {
        return Err(LinearError::Graphql(
            "agentActivityCreate returned success=false".into(),
        ));
    }

    Ok(payload.agent_activity.id.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn sample_delegation() -> InboxDelegation {
        InboxDelegation {
            session_id: "ses_abc".into(),
            issue_identifier: Some("ENG-123".into()),
            issue_id: Some("issue-uuid".into()),
            comment_id: None,
            initial_prompt: "Please fix the login bug.".into(),
            received_at: "2026-05-23T01:00:00Z".into(),
            source_webhook_id: "wh_xyz".into(),
            source_action: "created".into(),
        }
    }

    #[test]
    fn inbox_path_layout() {
        let p = inbox_path(Path::new("/tmp/Agent"), "ses_abc");
        assert_eq!(
            p,
            PathBuf::from("/tmp/Agent/.houston/inbox/linear/ses_abc.json")
        );
    }

    #[test]
    fn write_delegation_round_trips() {
        let dir = TempDir::new().unwrap();
        let d = sample_delegation();
        write_inbox_delegation(dir.path(), &d).unwrap();

        let path = inbox_path(dir.path(), &d.session_id);
        let bytes = std::fs::read(&path).unwrap();
        let back: InboxDelegation = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(back, d);
    }

    #[test]
    fn write_is_idempotent_in_place_for_same_session() {
        let dir = TempDir::new().unwrap();
        let mut d = sample_delegation();
        write_inbox_delegation(dir.path(), &d).unwrap();

        // Simulate a `prompted` follow-up replacing the `created`
        // payload.
        d.source_action = "prompted".into();
        d.initial_prompt = "Actually, look at the signup flow too.".into();
        write_inbox_delegation(dir.path(), &d).unwrap();

        let path = inbox_path(dir.path(), &d.session_id);
        let back: InboxDelegation = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(back.source_action, "prompted");
        assert!(back.initial_prompt.contains("signup flow"));
    }

    #[test]
    fn write_creates_parent_dirs_lazily() {
        let dir = TempDir::new().unwrap();
        // Don't pre-create .houston/inbox/linear/; writer should.
        let d = sample_delegation();
        write_inbox_delegation(dir.path(), &d).unwrap();
        assert!(inbox_path(dir.path(), &d.session_id).exists());
    }
}
