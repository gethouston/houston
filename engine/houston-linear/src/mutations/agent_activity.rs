//! Typed mutation for [`agentActivityCreate`] — Houston's egress path
//! to Linear's AgentSession event stream.
//!
//! Per Linear's [agent-interaction docs][1], `content` is a free-form
//! JSON object whose shape is determined by the activity type. V1
//! supports four shapes corresponding to the [`AgentActivityKind`]
//! enum; the [`build_content`] helper renders the canonical
//! `{type, body}` object for each.
//!
//! ## Rate budget
//!
//! Mutations cost ~10 complexity points per call against Linear's
//! 3M-pts/hr budget ([`crate::RATE_LIMIT_POINTS_PER_HOUR`]). Agent
//! activities are sparse (one per agent-session-state-change), so this
//! is well under budget even at hundreds of concurrent sessions.
//!
//! [1]: https://linear.app/developers/agent-interaction#activity-content-payload

use cynic::QueryFragment;
use serde::{Deserialize, Serialize};

// Reuse the parent crate's single schema module so cynic's marker
// types are unique (one `pub mod schema {}` per crate; per-module
// re-declarations would produce distinct types and break
// `IsScalar<SchemaMarker>` resolution for shared scalars like
// `JsonObject`). See `queries::issues` for the same pattern.
#[allow(unused_imports)]
use crate::queries::{schema, JsonObject};

/// V1 content kinds Houston emits. Maps 1:1 to Linear's
/// `AgentActivityType` enum, narrowed to the four Houston actually
/// produces during session lifecycle.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentActivityKind {
    /// Visible reasoning step — model output snippet during work.
    Thought,
    /// Tool call / file write — surfaces through Houston's non-
    /// technical-voice product prompt before posting.
    Action,
    /// Terminal success — what the agent says to the user.
    Response,
    /// Terminal failure — engine surfaces a Report-bug card on Linear.
    Error,
}

impl AgentActivityKind {
    /// Wire string used inside the `content.type` field.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Thought => "thought",
            Self::Action => "action",
            Self::Response => "response",
            Self::Error => "error",
        }
    }
}

/// Build the `content` JSON object Linear expects for one of the four
/// V1 activity kinds. `body` is Markdown — Linear renders it; Houston
/// produces the friendly-voice text upstream.
pub fn build_content(kind: AgentActivityKind, body: impl Into<String>) -> JsonObject {
    JsonObject(serde_json::json!({
        "type": kind.as_str(),
        "body": body.into(),
    }))
}

// ── cynic typed mutation ────────────────────────────────────────

/// Variables for [`CreateAgentActivity`].
#[derive(cynic::QueryVariables, Debug)]
pub struct CreateAgentActivityVars {
    pub input: AgentActivityCreateInput,
}

/// Input mirror of Linear's `AgentActivityCreateInput`. Narrowed to
/// the fields Houston actually populates (V1: `agentSessionId` +
/// `content`).
#[derive(cynic::InputObject, Debug, Clone)]
#[cynic(schema = "linear", graphql_type = "AgentActivityCreateInput")]
pub struct AgentActivityCreateInput {
    #[cynic(rename = "agentSessionId")]
    pub agent_session_id: String,
    pub content: JsonObject,
}

/// `mutation { agentActivityCreate(input: $input) { success agentActivity { id } } }`.
///
/// `success` is Linear's own success flag; `agent_activity.id` is the
/// canonical UUID for the activity (echoed back so the caller can
/// reference it in subsequent calls / on-disk logs).
#[derive(QueryFragment, Debug)]
#[cynic(
    schema = "linear",
    graphql_type = "Mutation",
    variables = "CreateAgentActivityVars"
)]
pub struct CreateAgentActivity {
    #[arguments(input: $input)]
    pub agent_activity_create: AgentActivityPayload,
}

#[derive(QueryFragment, Debug)]
#[cynic(schema = "linear", graphql_type = "AgentActivityPayload")]
pub struct AgentActivityPayload {
    pub success: bool,
    pub agent_activity: AgentActivityRef,
}

#[derive(QueryFragment, Debug)]
#[cynic(schema = "linear", graphql_type = "AgentActivity")]
pub struct AgentActivityRef {
    pub id: cynic::Id,
}

#[cfg(test)]
mod tests {
    use super::*;
    use cynic::MutationBuilder;

    #[test]
    fn build_content_thought_round_trips() {
        let obj = build_content(AgentActivityKind::Thought, "Looking at the issue...");
        let v: serde_json::Value = serde_json::to_value(&obj).unwrap();
        assert_eq!(v["type"], "thought");
        assert_eq!(v["body"], "Looking at the issue...");
    }

    #[test]
    fn build_content_response_serializes_canonical_shape() {
        let obj = build_content(AgentActivityKind::Response, "Done — see PR #42.");
        let s = serde_json::to_string(&obj).unwrap();
        assert!(s.contains("\"type\":\"response\""));
        assert!(s.contains("\"body\":\"Done"));
    }

    #[test]
    fn all_kinds_have_distinct_wire_strings() {
        let strs = [
            AgentActivityKind::Thought.as_str(),
            AgentActivityKind::Action.as_str(),
            AgentActivityKind::Response.as_str(),
            AgentActivityKind::Error.as_str(),
        ];
        let mut sorted = strs.to_vec();
        sorted.sort_unstable();
        sorted.dedup();
        assert_eq!(sorted.len(), 4, "duplicates: {strs:?}");
    }

    #[test]
    fn mutation_builds_against_vendored_schema() {
        // Compile-only sanity check — proves cynic's codegen accepts
        // our QueryFragment shape against the real Linear schema.
        let vars = CreateAgentActivityVars {
            input: AgentActivityCreateInput {
                agent_session_id: "ses_abc".into(),
                content: build_content(AgentActivityKind::Response, "ok"),
            },
        };
        let op = CreateAgentActivity::build(vars);
        let body = serde_json::to_string(&op).unwrap();
        assert!(body.contains("agentActivityCreate"));
        assert!(body.contains("ses_abc"));
    }
}
