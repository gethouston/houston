//! Transport-neutral AgentSession ingress + egress commands.
//!
//! Engine-server routes lift these for HTTP endpoints; the future
//! engine-core dispatcher calls [`dispatch_from_webhook`] directly
//! from inside the webhook handler chain (C3 wires the ledger →
//! C4 wires the ledger → inbox handoff).

use crate::agent_session::{self, InboxDelegation};
use crate::error::LinearError;
use crate::mutations::agent_activity::AgentActivityKind;
use crate::webhook_ledger::LedgerEntry;
use std::path::Path;

/// Inspect a Linear webhook delivery and, if it's an AgentSession
/// event Houston should act on, write a delegation file to the
/// workspace inbox.
///
/// Returns `Ok(Some(session_id))` when a delegation was written,
/// `Ok(None)` for ignored event types (every non-AgentSessionEvent
/// webhook flows past this without side effects). Caller fans the
/// `Some` case into downstream notifications (engine event → desktop
/// invalidation) — that wiring lives in engine-core.
///
/// ## Action coverage
///
/// V1 handles `created` + `prompted`. `cancelled`, `completed`, and
/// other lifecycle events are passed through ledger-only — the agent
/// shell tracks its own session state and doesn't need a re-write to
/// know "Linear closed this".
pub fn dispatch_from_webhook(
    workspace_path: &Path,
    entry: &LedgerEntry,
) -> Result<Option<String>, LinearError> {
    if entry.event_type != "AgentSessionEvent" {
        return Ok(None);
    }
    if entry.action != "created" && entry.action != "prompted" {
        return Ok(None);
    }

    let session_id = entry
        .payload
        .pointer("/data/agentSession/id")
        .and_then(|v| v.as_str())
        .or_else(|| {
            entry
                .payload
                .pointer("/data/agentSessionId")
                .and_then(|v| v.as_str())
        })
        .ok_or_else(|| {
            LinearError::SchemaDrift(
                "AgentSessionEvent payload missing session id at /data/agentSession/id or /data/agentSessionId".into(),
            )
        })?
        .to_string();

    let initial_prompt = entry
        .payload
        .pointer("/data/agentActivity/content/body")
        .or_else(|| entry.payload.pointer("/data/issue/description"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let issue_identifier = entry
        .payload
        .pointer("/data/issue/identifier")
        .and_then(|v| v.as_str())
        .map(String::from);
    let issue_id = entry
        .payload
        .pointer("/data/issue/id")
        .and_then(|v| v.as_str())
        .map(String::from);
    let comment_id = entry
        .payload
        .pointer("/data/comment/id")
        .and_then(|v| v.as_str())
        .map(String::from);

    let delegation = InboxDelegation {
        session_id: session_id.clone(),
        issue_identifier,
        issue_id,
        comment_id,
        initial_prompt,
        received_at: entry.delivered_at.clone(),
        source_webhook_id: entry.webhook_id.clone(),
        source_action: entry.action.clone(),
    };

    agent_session::write_inbox_delegation(workspace_path, &delegation)?;
    Ok(Some(session_id))
}

/// Post an agent activity to Linear's session event stream.
/// Thin wrapper for symmetry with [`dispatch_from_webhook`] —
/// engine-server routes call this; the underlying transport lives in
/// [`crate::agent_session::post_activity`].
pub async fn emit_activity(
    workspace_path: &Path,
    http: &reqwest::Client,
    session_id: &str,
    kind: AgentActivityKind,
    body: impl Into<String>,
) -> Result<String, LinearError> {
    agent_session::post_activity(workspace_path, http, session_id, kind, body).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn ledger_entry_with_payload(
        event_type: &str,
        action: &str,
        payload: serde_json::Value,
    ) -> LedgerEntry {
        LedgerEntry {
            webhook_id: "wh_test".into(),
            delivered_at: "2026-05-23T01:00:00Z".into(),
            event_type: event_type.into(),
            action: action.into(),
            payload,
        }
    }

    #[test]
    fn ignores_non_agent_session_events() {
        let dir = TempDir::new().unwrap();
        let entry = ledger_entry_with_payload("Issue", "create", serde_json::json!({}));
        let r = dispatch_from_webhook(dir.path(), &entry).unwrap();
        assert!(r.is_none(), "Issue create should be ignored, got: {r:?}");
    }

    #[test]
    fn ignores_uninteresting_actions() {
        let dir = TempDir::new().unwrap();
        let entry = ledger_entry_with_payload(
            "AgentSessionEvent",
            "cancelled",
            serde_json::json!({"data": {"agentSession": {"id": "ses_abc"}}}),
        );
        let r = dispatch_from_webhook(dir.path(), &entry).unwrap();
        assert!(r.is_none());
    }

    #[test]
    fn writes_inbox_on_created() {
        let dir = TempDir::new().unwrap();
        let entry = ledger_entry_with_payload(
            "AgentSessionEvent",
            "created",
            serde_json::json!({
                "data": {
                    "agentSession": {"id": "ses_abc"},
                    "issue": {"id": "iss_1", "identifier": "ENG-42", "description": "Fix it"},
                }
            }),
        );

        let r = dispatch_from_webhook(dir.path(), &entry).unwrap();
        assert_eq!(r.as_deref(), Some("ses_abc"));

        let path = agent_session::inbox_path(dir.path(), "ses_abc");
        assert!(path.exists());
        let d: InboxDelegation = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(d.session_id, "ses_abc");
        assert_eq!(d.issue_identifier.as_deref(), Some("ENG-42"));
        assert_eq!(d.issue_id.as_deref(), Some("iss_1"));
        assert_eq!(d.initial_prompt, "Fix it");
        assert_eq!(d.source_action, "created");
    }

    #[test]
    fn writes_inbox_on_prompted_with_activity_body() {
        let dir = TempDir::new().unwrap();
        let entry = ledger_entry_with_payload(
            "AgentSessionEvent",
            "prompted",
            serde_json::json!({
                "data": {
                    "agentSession": {"id": "ses_xyz"},
                    "agentActivity": {"content": {"type": "prompt", "body": "More details please"}},
                }
            }),
        );

        let r = dispatch_from_webhook(dir.path(), &entry).unwrap();
        assert_eq!(r.as_deref(), Some("ses_xyz"));

        let path = agent_session::inbox_path(dir.path(), "ses_xyz");
        let d: InboxDelegation = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        assert_eq!(d.initial_prompt, "More details please");
        assert_eq!(d.source_action, "prompted");
    }

    #[test]
    fn schema_drift_on_missing_session_id() {
        let dir = TempDir::new().unwrap();
        let entry = ledger_entry_with_payload(
            "AgentSessionEvent",
            "created",
            serde_json::json!({"data": {"issue": {"id": "x"}}}),
        );
        let err = dispatch_from_webhook(dir.path(), &entry).unwrap_err();
        assert!(matches!(err, LinearError::SchemaDrift(_)), "got: {err:?}");
    }

    #[test]
    fn falls_back_to_agent_session_id_pointer() {
        // Some Linear webhook shapes carry `agentSessionId` at the
        // top of `data` instead of nesting under `agentSession.id`.
        // The fallback pointer covers that variant.
        let dir = TempDir::new().unwrap();
        let entry = ledger_entry_with_payload(
            "AgentSessionEvent",
            "created",
            serde_json::json!({
                "data": {"agentSessionId": "ses_alt", "issue": {"description": "go"}}
            }),
        );
        let r = dispatch_from_webhook(dir.path(), &entry).unwrap();
        assert_eq!(r.as_deref(), Some("ses_alt"));
    }
}
