//! Parser for Gemini CLI `--output-format stream-json` NDJSON output.
//!
//! Maps the 6 documented [`GeminiEvent`] variants (init, message,
//! tool_use, tool_result, error, result) to Houston's provider-agnostic
//! [`FeedItem`] enum. Pinned to gemini-cli **v0.42.0** (the bundled
//! version); see `/tmp/gemini-schema-findings.md` and
//! `/tmp/gemini-schema-delta-v0.42.md` for the wire-format spec.
//!
//! Public surface mirrors [`crate::parser`] / [`crate::codex_parser`]:
//! - [`extract_session_id`] — pulls `session_id` from the `init` line
//!   so the runner can persist it for `--resume <id>`.
//! - [`parse_gemini_event`] — translates one NDJSON line into 0..N
//!   [`FeedItem`]s, given a mutable [`GeminiAccumulator`] for
//!   cross-line state (assistant streaming buffer, tool_id → name map).
//!
//! The session_io dispatch arm calls these by name; their signatures
//! intentionally match the Claude / Codex parsers so the new arm is one
//! line.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

// ---------------------------------------------------------------------------
// Wire types — see /tmp/gemini-schema-findings.md §7
// ---------------------------------------------------------------------------

/// One line of `gemini --output-format stream-json` output.
///
/// Pinned to gemini-cli **v0.42.0** (see `/tmp/gemini-schema-delta-v0.42.md`).
/// The [`Self::Unknown`] variant via `#[serde(other)]` keeps the parser
/// forward-compatible with future event types (e.g. when upstream wires
/// `Thought` into stream-json).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum GeminiEvent {
    Init {
        #[serde(default)]
        timestamp: String,
        session_id: String,
        #[serde(default)]
        model: String,
    },
    Message {
        #[serde(default)]
        timestamp: String,
        role: GeminiMessageRole,
        #[serde(default)]
        content: String,
        #[serde(default)]
        delta: bool,
    },
    ToolUse {
        #[serde(default)]
        timestamp: String,
        tool_name: String,
        tool_id: String,
        #[serde(default)]
        parameters: HashMap<String, Value>,
    },
    ToolResult {
        #[serde(default)]
        timestamp: String,
        tool_id: String,
        status: GeminiStatus,
        #[serde(default)]
        output: Option<String>,
        #[serde(default)]
        error: Option<GeminiErrorPayload>,
    },
    Error {
        #[serde(default)]
        timestamp: String,
        #[allow(dead_code)]
        severity: GeminiErrorSeverity,
        message: String,
    },
    Result {
        #[serde(default)]
        timestamp: String,
        status: GeminiStatus,
        #[serde(default)]
        error: Option<GeminiErrorPayload>,
        #[serde(default)]
        stats: Option<GeminiStreamStats>,
    },
    /// Forward-compat: any future `type` value parses here so the parser
    /// keeps making progress instead of dropping the entire line.
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum GeminiMessageRole {
    User,
    Assistant,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum GeminiStatus {
    Success,
    Error,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum GeminiErrorSeverity {
    Warning,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct GeminiErrorPayload {
    /// Upstream error class name (e.g. `"FatalAuthenticationError"`,
    /// `"GaxiosError"`, `"MaxSessionTurnsError"`) or a tool errorType
    /// string like `"FILE_NOT_FOUND"`.
    #[serde(rename = "type")]
    pub kind: String,
    pub message: String,
}

/// Token + timing aggregate emitted on the terminal `result` event.
///
/// `models` was added in gemini-cli v0.42.0 (per-model breakdown for
/// sessions that routed to multiple models). Older versions omit it; we
/// use `#[serde(default)]` so an older bundled CLI still deserialises.
/// `Copy` was DROPPED from the v0.32.1 sketch because `HashMap` is not
/// `Copy` — see `/tmp/gemini-schema-delta-v0.42.md`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct GeminiStreamStats {
    pub total_tokens: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cached: u64,
    pub input: u64,
    pub duration_ms: u64,
    pub tool_calls: u64,
    #[serde(default)]
    pub models: HashMap<String, ModelStreamStats>,
}

/// Per-model subset of [`GeminiStreamStats`] (no `duration_ms` /
/// `tool_calls` because those are session-wide). Added in v0.42.0.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct ModelStreamStats {
    pub total_tokens: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cached: u64,
    pub input: u64,
}

// ---------------------------------------------------------------------------
// Parser state + entry points (see gemini_parser_state.rs for the real
// translator — kept separate to stay under the 200-line limit per file).
// ---------------------------------------------------------------------------

pub use crate::gemini_parser_state::{extract_session_id, parse_gemini_event, GeminiAccumulator};

#[cfg(test)]
mod wire_tests {
    use super::*;

    #[test]
    fn deserializes_init() {
        let line = r#"{"type":"init","timestamp":"2025-10-10T12:00:00.000Z","session_id":"s1","model":"gemini-2.5-pro"}"#;
        let ev: GeminiEvent = serde_json::from_str(line).unwrap();
        match ev {
            GeminiEvent::Init {
                session_id, model, ..
            } => {
                assert_eq!(session_id, "s1");
                assert_eq!(model, "gemini-2.5-pro");
            }
            other => panic!("expected Init, got {other:?}"),
        }
    }

    #[test]
    fn deserializes_message_assistant_delta() {
        let line =
            r#"{"type":"message","timestamp":"t","role":"assistant","content":"4","delta":true}"#;
        let ev: GeminiEvent = serde_json::from_str(line).unwrap();
        match ev {
            GeminiEvent::Message {
                role,
                content,
                delta,
                ..
            } => {
                assert_eq!(role, GeminiMessageRole::Assistant);
                assert_eq!(content, "4");
                assert!(delta);
            }
            other => panic!("expected Message, got {other:?}"),
        }
    }

    #[test]
    fn deserializes_tool_use_with_parameters() {
        let line = r#"{"type":"tool_use","timestamp":"t","tool_name":"Read","tool_id":"r1","parameters":{"file_path":"/x"}}"#;
        let ev: GeminiEvent = serde_json::from_str(line).unwrap();
        match ev {
            GeminiEvent::ToolUse {
                tool_name,
                tool_id,
                parameters,
                ..
            } => {
                assert_eq!(tool_name, "Read");
                assert_eq!(tool_id, "r1");
                assert_eq!(parameters.get("file_path").unwrap().as_str(), Some("/x"));
            }
            other => panic!("expected ToolUse, got {other:?}"),
        }
    }

    #[test]
    fn deserializes_unknown_variant_without_panic() {
        let line = r#"{"type":"thought","timestamp":"t","text":"hmm"}"#;
        let ev: GeminiEvent = serde_json::from_str(line).unwrap();
        assert!(matches!(ev, GeminiEvent::Unknown));
    }

    #[test]
    fn stats_accepts_v042_models_field() {
        let line = r#"{"type":"result","timestamp":"t","status":"success","stats":{"total_tokens":10,"input_tokens":5,"output_tokens":5,"cached":0,"input":5,"duration_ms":100,"tool_calls":0,"models":{"gemini-2.5-pro":{"total_tokens":10,"input_tokens":5,"output_tokens":5,"cached":0,"input":5}}}}"#;
        let ev: GeminiEvent = serde_json::from_str(line).unwrap();
        match ev {
            GeminiEvent::Result {
                stats: Some(stats), ..
            } => {
                assert_eq!(stats.total_tokens, 10);
                assert!(stats.models.contains_key("gemini-2.5-pro"));
            }
            other => panic!("expected Result with stats, got {other:?}"),
        }
    }

    #[test]
    fn stats_tolerates_missing_models_field_v032() {
        // Older v0.32.1 stats payload — no `models` field.
        let line = r#"{"type":"result","timestamp":"t","status":"success","stats":{"total_tokens":10,"input_tokens":5,"output_tokens":5,"cached":0,"input":5,"duration_ms":100,"tool_calls":0}}"#;
        let ev: GeminiEvent = serde_json::from_str(line).unwrap();
        match ev {
            GeminiEvent::Result {
                stats: Some(stats), ..
            } => {
                assert!(stats.models.is_empty());
            }
            other => panic!("expected Result with stats, got {other:?}"),
        }
    }
}
