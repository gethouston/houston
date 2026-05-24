//! `/v1/mcp/:session_key/` — in-engine MCP server.
//!
//! Hand-rolled minimal Streamable-HTTP MCP server. Just enough surface to host
//! a single tool, `AskUserQuestion`, that the Claude CLI subprocess can call
//! over loopback HTTP. We hand-roll (rather than depend on `rmcp`) because
//! every rmcp release tracking the current MCP spec pulls in axum 0.8 while
//! the rest of `houston-engine-server` is on axum 0.7.
//!
//! ## Wire shape
//!
//! Per the [Streamable HTTP transport][mcp-transport]:
//!
//! - POST `/v1/mcp/:session_key/` with a JSON-RPC 2.0 request → JSON response
//!   (we don't open SSE — single-shot JSON is allowed and simpler).
//! - POST with a notification (no `id`) → 202 Accepted, empty body.
//! - GET `/v1/mcp/:session_key/` → 405 Method Not Allowed (no server-to-
//!   client push needed; we never originate messages).
//! - DELETE → 405 Method Not Allowed.
//!
//! [mcp-transport]: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#streamable-http
//!
//! ## Methods we implement
//!
//! - `initialize` — handshake. Returns protocol version, server info,
//!   capabilities (`tools` only).
//! - `notifications/initialized` — client signals it's ready; 202 + no-op.
//! - `notifications/cancelled` — client aborts a request; we currently no-op
//!   because our only blocking call (`tools/call` on `AskUserQuestion`) is
//!   cancelled via `SessionRuntime::ask_user.cancel(session_key)` from the
//!   sessions::cancel path. Adding per-request cancellation here is phase 2.
//! - `tools/list` — returns the AskUserQuestion definition.
//! - `tools/call` — blocks on the [`PendingAskUserRegistry`] until the user
//!   answers, returns the answer as the tool result.
//! - `ping` — heartbeat. Returns empty result.
//!
//! Other methods get `-32601` Method Not Found.
//!
//! ## Session scoping
//!
//! The `session_key` path parameter is how Houston (not MCP) identifies the
//! agent conversation. It's baked into the per-session mcp_config the engine
//! writes when spawning claude; the URL therefore arrives pre-correlated.
//! We do not use the MCP-spec `Mcp-Session-Id` header.

use crate::routes::error::ApiError;
use crate::state::ServerState;
use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Response,
    },
    routing::post,
    Json, Router,
};
use houston_engine_core::CoreError;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::convert::Infallible;
use std::sync::Arc;
use std::time::Duration;

/// MCP protocol version we speak. The spec calls for clients to send back
/// whatever the server returned during `initialize`; sticking with a known
/// stable version (rather than echoing the client's request) lets us avoid
/// surprises if a future Claude CLI starts requesting a newer spec.
const PROTOCOL_VERSION: &str = "2025-06-18";

/// The MCP tool we register. The agent calls it as
/// `mcp__houston__AskUserQuestion` (the `mcp__<server>__<tool>` convention
/// is enforced by the client, not us).
const TOOL_NAME: &str = "AskUserQuestion";

const TOOL_DESCRIPTION: &str =
    "Use this tool when you need to ask the user questions during execution. \
This allows you to gather user preferences, clarify ambiguous instructions, get \
decisions on implementation choices, or offer choices about what direction to \
take. An 'Other' option that allows free-form input is automatically provided \
to the user, so do NOT include 'Other' or similar options in your options \
array. If you want to ask a question referring to work you did (e.g., a plan \
you wrote), you must write that work as an assistant message AND end your turn \
(give them a chance to read and respond) BEFORE using this tool.";

pub fn router() -> Router<Arc<ServerState>> {
    Router::new()
        .route("/mcp/:session_key", post(handle_post).get(handle_get))
        .route("/mcp/:session_key/", post(handle_post).get(handle_get))
}

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 envelope
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct JsonRpcRequest {
    #[allow(dead_code)] // serde_json::from_value rejects unknown fields without this
    jsonrpc: Option<String>,
    #[serde(default)]
    id: Option<Value>,
    method: String,
    #[serde(default)]
    params: Value,
}

#[derive(Debug, Serialize)]
struct JsonRpcSuccess {
    jsonrpc: &'static str,
    id: Value,
    result: Value,
}

#[derive(Debug, Serialize)]
struct JsonRpcError {
    jsonrpc: &'static str,
    id: Value,
    error: JsonRpcErrorBody,
}

#[derive(Debug, Serialize)]
struct JsonRpcErrorBody {
    code: i32,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<Value>,
}

const ERR_PARSE: i32 = -32700;
const ERR_METHOD_NOT_FOUND: i32 = -32601;
const ERR_INVALID_PARAMS: i32 = -32602;
const ERR_INTERNAL: i32 = -32603;

fn success(id: Value, result: Value) -> Response {
    Json(JsonRpcSuccess {
        jsonrpc: "2.0",
        id,
        result,
    })
    .into_response()
}

fn rpc_error(id: Value, code: i32, message: impl Into<String>) -> Response {
    Json(JsonRpcError {
        jsonrpc: "2.0",
        id,
        error: JsonRpcErrorBody {
            code,
            message: message.into(),
            data: None,
        },
    })
    .into_response()
}

// ---------------------------------------------------------------------------
// HTTP handlers
// ---------------------------------------------------------------------------

/// GET on the MCP endpoint is for opening an optional server-to-client SSE
/// stream. We don't push to the client, so we decline.
async fn handle_get() -> Response {
    StatusCode::METHOD_NOT_ALLOWED.into_response()
}

/// POST is the workhorse — every JSON-RPC request, notification, and response
/// from the client lands here. Returns either a `JsonRpcSuccess` /
/// `JsonRpcError` JSON body for requests, or `202 Accepted` for notifications.
async fn handle_post(
    State(st): State<Arc<ServerState>>,
    Path(session_key): Path<String>,
    body: Json<Value>,
) -> Response {
    // Parse the envelope ourselves (rather than via the typed extractor) so
    // we can return a spec-conformant JSON-RPC error for malformed bodies
    // instead of an axum 400.
    let raw: Value = body.0;
    let req: JsonRpcRequest = match serde_json::from_value(raw) {
        Ok(r) => r,
        Err(e) => {
            return rpc_error(Value::Null, ERR_PARSE, format!("parse error: {e}"));
        }
    };

    let id = req.id.clone();
    let is_request = id.is_some();
    let id_for_dispatch = id.clone().unwrap_or(Value::Null);

    let response = match req.method.as_str() {
        "initialize" => handle_initialize(id_for_dispatch, req.params),
        "notifications/initialized" | "notifications/cancelled" => {
            // Notifications: no body, no response. The client doesn't
            // expect anything except the 202.
            return StatusCode::ACCEPTED.into_response();
        }
        "ping" => success(id_for_dispatch, json!({})),
        "tools/list" => handle_tools_list(id_for_dispatch),
        "tools/call" => {
            // Special-case: this handler may block for minutes waiting on a
            // user answer. Plain JSON would hit Claude CLI's 60-second
            // first-byte fetch budget. Return SSE so we can flush keepalive
            // bytes during the wait; the spec allows it (section "Sending
            // Messages to the Server" in the Streamable HTTP transport).
            return handle_tools_call_sse(
                st.clone(),
                session_key.clone(),
                id_for_dispatch,
                req.params,
            )
            .await;
        }
        other => rpc_error(
            id_for_dispatch,
            ERR_METHOD_NOT_FOUND,
            format!("method not found: {other}"),
        ),
    };

    // For a notification we already returned 202 above; this branch is for
    // requests that produced a JsonRpc envelope.
    if !is_request {
        // Defensive: a method handler somehow returned a body for what looks
        // like a notification. Spec says we MUST 202 a notification with no
        // body. Drop whatever the handler made.
        return StatusCode::ACCEPTED.into_response();
    }
    response
}

// ---------------------------------------------------------------------------
// Method handlers
// ---------------------------------------------------------------------------

fn handle_initialize(id: Value, _params: Value) -> Response {
    success(
        id,
        json!({
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {
                "tools": { "listChanged": false }
            },
            "serverInfo": {
                "name": "houston",
                "version": env!("CARGO_PKG_VERSION"),
            }
        }),
    )
}

fn handle_tools_list(id: Value) -> Response {
    success(
        id,
        json!({
            "tools": [
                {
                    "name": TOOL_NAME,
                    "description": TOOL_DESCRIPTION,
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "questions": {
                                "type": "array",
                                "description": "One or more questions to put to the user. Render order is preserved.",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "question": {
                                            "type": "string",
                                            "description": "The text of the question."
                                        },
                                        "options": {
                                            "type": "array",
                                            "description": "Discrete answer choices. Do NOT include 'Other' — the UI adds it automatically.",
                                            "items": { "type": "string" }
                                        },
                                        "multiSelect": {
                                            "type": "boolean",
                                            "description": "True if the user may pick more than one option. Defaults to false."
                                        }
                                    },
                                    "required": ["question", "options"]
                                }
                            }
                        },
                        "required": ["questions"]
                    }
                }
            ]
        }),
    )
}

/// Resolve a `tools/call` against the registry. Used by tests (synchronous
/// API surface) and by the SSE handler (which wraps it inside a stream).
async fn resolve_tools_call(
    st: &ServerState,
    session_key: &str,
    id: Value,
    params: Value,
) -> Result<Value, CoreError> {
    let name = params
        .get("name")
        .and_then(|v| v.as_str())
        .ok_or_else(|| CoreError::BadRequest("tools/call: missing 'name'".into()))?;

    if name != TOOL_NAME {
        // Encode "unknown tool" as a JSON-RPC error wrapped in a Value so
        // the caller can choose how to deliver it (plain JSON vs SSE).
        return Ok(json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": {
                "code": ERR_METHOD_NOT_FOUND,
                "message": format!("unknown tool: {name}")
            }
        }));
    }

    // (1) Wait until the NDJSON parser sees the matching `tool_use_id` for
    // this session. In practice the parser pushes within milliseconds —
    // sometimes BEFORE this handler is even invoked.
    let tool_use_id = st.engine.sessions.ask_user.mcp_invoked(session_key).await?;

    // (2) Block until the user POSTs an answer to `/user_input`. This is
    // where the wall-clock latency lives — the agent's turn is paused on
    // this single await. SSE keepalives at the transport layer prevent
    // claude's first-byte timeout from firing during this wait.
    let answer = st
        .engine
        .sessions
        .ask_user
        .mcp_await_answer(session_key, &tool_use_id)
        .await?;

    // (3) Build the tool result envelope. We serialize the typed answer
    // to JSON text — claude surfaces this as the tool_result block on the
    // next NDJSON frame, which the parser then emits as
    // `FeedItem::ToolResult` to the UI (closing the card).
    let answer_text = serde_json::to_string(&answer)
        .map_err(|e| CoreError::Internal(format!("ask_user answer serialize: {e}")))?;

    Ok(json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": {
            "content": [
                { "type": "text", "text": answer_text }
            ],
            "isError": false,
            // Also include the structured form so future clients that
            // understand it don't have to re-parse the text.
            "structuredContent": answer
        }
    }))
}

/// Test-only helper that returns the legacy plain-JSON shape for `tools/call`.
/// Production traffic goes through [`handle_tools_call_sse`].
#[cfg(test)]
async fn handle_tools_call(
    st: &ServerState,
    session_key: &str,
    id: Value,
    params: Value,
) -> Result<Response, CoreError> {
    let envelope = resolve_tools_call(st, session_key, id, params).await?;
    Ok(Json(envelope).into_response())
}

/// SSE-wrapped `tools/call`. Streams keepalive bytes to satisfy claude
/// CLI's 60-second first-byte fetch budget, then a single SSE event
/// carrying the JSON-RPC envelope, then closes the stream.
///
/// MCP Streamable HTTP spec allows the server to return either a plain
/// JSON body or `Content-Type: text/event-stream`. We use SSE here
/// specifically because this is the one handler whose response time
/// depends on a human clicking a button.
async fn handle_tools_call_sse(
    st: Arc<ServerState>,
    session_key: String,
    id: Value,
    params: Value,
) -> Response {
    // The resolver future is spawned into a single-item stream. The SSE
    // wrapper layers a 15-second keepalive on top, so claude sees bytes
    // periodically while we wait on the user.
    let stream = async_stream::stream! {
        let envelope = match resolve_tools_call(&st, &session_key, id.clone(), params).await {
            Ok(v) => v,
            Err(e) => {
                let code = match &e {
                    CoreError::BadRequest(_) => ERR_INVALID_PARAMS,
                    CoreError::NotFound(_) => ERR_METHOD_NOT_FOUND,
                    _ => ERR_INTERNAL,
                };
                json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "error": { "code": code, "message": e.to_string() }
                })
            }
        };
        // Serializing must succeed for any JSON value we constructed.
        let payload = serde_json::to_string(&envelope)
            .unwrap_or_else(|_| String::from("{\"jsonrpc\":\"2.0\",\"error\":{\"code\":-32603,\"message\":\"serialize failure\"}}"));
        yield Ok::<Event, Infallible>(Event::default().data(payload));
    };
    Sse::new(stream)
        .keep_alive(
            KeepAlive::new()
                .interval(Duration::from_secs(15))
                .text(": keepalive"),
        )
        .into_response()
}

fn map_core_error(id: Value, e: CoreError) -> Response {
    let code = match &e {
        CoreError::BadRequest(_) => ERR_INVALID_PARAMS,
        CoreError::NotFound(_) => ERR_METHOD_NOT_FOUND,
        _ => ERR_INTERNAL,
    };
    rpc_error(id, code, e.to_string())
}

// Quiet ApiError import warning. The MCP layer doesn't return ApiError
// (every code path here either produces a JsonRpc envelope or HTTP status),
// but keeping the import documents that we considered it.
#[allow(dead_code)]
type _ApiErrorPlaceholder = ApiError;

// ---------------------------------------------------------------------------
// Tests — exercise the JSON-RPC dispatch against a real ServerState.
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::ServerConfig;
    use axum::body::to_bytes;
    use std::time::Duration;
    use tempfile::TempDir;

    async fn test_state() -> (Arc<ServerState>, TempDir) {
        // Test ServerState rooted at a TempDir so the engine.json write
        // and any other side effects don't escape the test sandbox.
        let dir = TempDir::new().unwrap();
        let cfg = ServerConfig {
            bind: "127.0.0.1:0".parse().unwrap(),
            token: "test-token".into(),
            home_dir: dir.path().to_path_buf(),
            docs_dir: dir.path().to_path_buf(),
            app_system_prompt: String::new(),
            app_onboarding_prompt: String::new(),
            tunnel_url: "https://tunnel.test".into(),
        };
        let state = ServerState::new(cfg, None)
            .await
            .expect("ServerState::new should succeed in tests");
        (Arc::new(state), dir)
    }

    async fn body_to_value(resp: Response) -> Value {
        let body = to_bytes(resp.into_body(), 1024 * 1024).await.unwrap();
        serde_json::from_slice(&body).unwrap()
    }

    #[tokio::test]
    async fn initialize_returns_protocol_version_and_server_info() {
        let (state, _dir) = test_state().await;
        let resp = handle_post(
            State(state),
            Path("test-session".into()),
            Json(json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": PROTOCOL_VERSION,
                    "capabilities": {},
                    "clientInfo": { "name": "test-client", "version": "0.0.1" }
                }
            })),
        )
        .await;
        let value = body_to_value(resp).await;
        assert_eq!(value["jsonrpc"], "2.0");
        assert_eq!(value["id"], 1);
        assert_eq!(value["result"]["protocolVersion"], PROTOCOL_VERSION);
        assert_eq!(value["result"]["serverInfo"]["name"], "houston");
        assert!(value["result"]["capabilities"]["tools"].is_object());
    }

    #[tokio::test]
    async fn notifications_initialized_returns_202_with_no_body() {
        let (state, _dir) = test_state().await;
        let resp = handle_post(
            State(state),
            Path("test-session".into()),
            Json(json!({
                "jsonrpc": "2.0",
                "method": "notifications/initialized"
            })),
        )
        .await;
        assert_eq!(resp.status(), StatusCode::ACCEPTED);
        let bytes = to_bytes(resp.into_body(), 1024).await.unwrap();
        assert!(
            bytes.is_empty(),
            "notification response must have empty body"
        );
    }

    #[tokio::test]
    async fn tools_list_returns_ask_user_question() {
        let (state, _dir) = test_state().await;
        let resp = handle_post(
            State(state),
            Path("sk".into()),
            Json(json!({"jsonrpc":"2.0","id":2,"method":"tools/list"})),
        )
        .await;
        let value = body_to_value(resp).await;
        let tools = value["result"]["tools"].as_array().expect("tools array");
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0]["name"], TOOL_NAME);
        assert!(tools[0]["description"].as_str().unwrap().contains("Other"));
        // Schema must require questions array and forbid missing fields.
        assert_eq!(tools[0]["inputSchema"]["required"][0], "questions");
    }

    #[tokio::test]
    async fn unknown_method_returns_method_not_found() {
        let (state, _dir) = test_state().await;
        let resp = handle_post(
            State(state),
            Path("sk".into()),
            Json(json!({"jsonrpc":"2.0","id":3,"method":"nonsense"})),
        )
        .await;
        let value = body_to_value(resp).await;
        assert_eq!(value["error"]["code"], ERR_METHOD_NOT_FOUND);
    }

    #[tokio::test]
    async fn tools_call_blocks_then_returns_user_answer() {
        // Full happy path through the synchronous legacy helper. The SSE
        // path is covered by `tools_call_sse_streams_answer_after_submit`
        // — exercising both shapes ensures `resolve_tools_call` stays the
        // single source of truth for the answer-resolution logic.
        let (state, _dir) = test_state().await;
        let session = "sk-happy";

        state
            .engine
            .sessions
            .ask_user
            .parser_saw_tool_use(session, "tu_42".into())
            .await;

        let state_for_task = state.clone();
        let session_for_task = session.to_string();
        let mcp_handle = tokio::spawn(async move {
            handle_tools_call(
                &state_for_task,
                &session_for_task,
                json!(7),
                json!({
                    "name": TOOL_NAME,
                    "arguments": { "questions": [{"question":"pick","options":["a","b"],"multiSelect":false}] }
                }),
            )
            .await
            .expect("resolve_tools_call should succeed")
        });

        tokio::time::sleep(Duration::from_millis(20)).await;

        state
            .engine
            .sessions
            .ask_user
            .submit_answer(session, "tu_42", json!({"answers":[{"selected":["a"]}]}))
            .await
            .unwrap();

        let resp = tokio::time::timeout(Duration::from_millis(200), mcp_handle)
            .await
            .expect("MCP call should return after submit_answer")
            .unwrap();
        let value = body_to_value(resp).await;
        assert_eq!(value["id"], 7);
        assert!(value["result"]["isError"] == false);
        assert_eq!(
            value["result"]["structuredContent"]["answers"][0]["selected"][0],
            "a"
        );
        let txt = value["result"]["content"][0]["text"].as_str().unwrap();
        assert!(
            txt.contains("\"a\""),
            "text payload should include the answer"
        );
    }

    #[tokio::test]
    async fn tools_call_sse_streams_answer_after_submit() {
        // Verifies the production SSE shape that `handle_post` selects for
        // tools/call. claude needs the response Content-Type to be
        // `text/event-stream` and the body to start with `data: ` lines.
        let (state, _dir) = test_state().await;
        let session = "sk-sse";

        state
            .engine
            .sessions
            .ask_user
            .parser_saw_tool_use(session, "tu_99".into())
            .await;

        let state_for_task = state.clone();
        let session_for_task = session.to_string();
        let resp_handle = tokio::spawn(async move {
            handle_post(
                State(state_for_task),
                Path(session_for_task),
                Json(json!({
                    "jsonrpc": "2.0",
                    "id": 11,
                    "method": "tools/call",
                    "params": {
                        "name": TOOL_NAME,
                        "arguments": { "questions": [] }
                    }
                })),
            )
            .await
        });

        // handle_post for tools/call returns immediately with an SSE
        // wrapper whose body is lazy. Concurrently: submit the answer
        // (which unblocks the inner resolver) and drain the body.
        let resp = resp_handle
            .await
            .expect("handle_post should return SSE wrapper");
        assert_eq!(
            resp.headers()
                .get(axum::http::header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .unwrap_or(""),
            "text/event-stream"
        );

        let state_for_submit = state.clone();
        let session_for_submit = session.to_string();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(20)).await;
            state_for_submit
                .engine
                .sessions
                .ask_user
                .submit_answer(&session_for_submit, "tu_99", json!({"chosen": "yes"}))
                .await
                .unwrap();
        });

        let bytes = tokio::time::timeout(
            Duration::from_secs(2),
            to_bytes(resp.into_body(), 64 * 1024),
        )
        .await
        .expect("SSE stream should resolve once submit_answer fires")
        .expect("body bytes");
        let body = String::from_utf8_lossy(&bytes);
        assert!(body.contains("data: "), "missing SSE data prefix: {body}");
        // Extract the JSON-RPC payload from the first data line.
        let payload_line = body
            .lines()
            .find(|l| l.starts_with("data: "))
            .expect("a data: line");
        let payload: Value =
            serde_json::from_str(payload_line.trim_start_matches("data: ").trim()).unwrap();
        assert_eq!(payload["id"], 11);
        assert_eq!(payload["result"]["isError"], false);
        assert_eq!(payload["result"]["structuredContent"]["chosen"], "yes");
    }

    #[tokio::test]
    async fn tools_call_with_unknown_tool_name_returns_method_not_found() {
        // Unknown-tool error rides the same SSE channel — verify the
        // JSON-RPC error envelope is what arrives in the SSE data event.
        let (state, _dir) = test_state().await;
        let resp = handle_post(
            State(state),
            Path("sk".into()),
            Json(json!({
                "jsonrpc": "2.0",
                "id": 9,
                "method": "tools/call",
                "params": { "name": "not_a_real_tool", "arguments": {} }
            })),
        )
        .await;
        let bytes = to_bytes(resp.into_body(), 64 * 1024).await.unwrap();
        let body = String::from_utf8_lossy(&bytes);
        let payload_line = body
            .lines()
            .find(|l| l.starts_with("data: "))
            .expect("a data: line carrying the JSON-RPC error");
        let payload: Value =
            serde_json::from_str(payload_line.trim_start_matches("data: ").trim()).unwrap();
        assert_eq!(payload["error"]["code"], ERR_METHOD_NOT_FOUND);
    }

    #[tokio::test]
    async fn get_returns_method_not_allowed() {
        let resp = handle_get().await;
        assert_eq!(resp.status(), StatusCode::METHOD_NOT_ALLOWED);
    }
}
