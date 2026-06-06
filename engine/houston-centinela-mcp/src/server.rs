//! MCP server: JSON-RPC 2.0 dispatch over a single mutable session.
//!
//! [`handle_request`] is async because a `STEP_UP` verdict may escalate to a
//! human over WhatsApp and wait for the answer. With no approver configured it
//! stays a pure decision function: feed it request values and assert the reply.

use crate::approver::Approver;
use crate::tools;
use crate::{approval::Outcome, journal, state::ServerState};
use houston_centinela::{evaluate, Decision};
use serde_json::{json, Value};

/// Handle one JSON-RPC message. Returns the response value, or `None` for
/// notifications (no `id`), which expect no reply. `approver` is the optional
/// human escalation channel for step-ups.
pub async fn handle_request(
    state: &mut ServerState,
    approver: Option<&Approver>,
    req: &Value,
) -> Option<Value> {
    let method = req.get("method").and_then(Value::as_str).unwrap_or("");
    let id = req.get("id").cloned();
    match method {
        "initialize" => Some(ok(id, initialize_result(state, req))),
        "notifications/initialized" | "initialized" => None,
        "ping" => Some(ok(id, json!({}))),
        "tools/list" => Some(ok(id, json!({ "tools": tools::list_json() }))),
        "tools/call" => Some(handle_tools_call(state, approver, id, req).await),
        _ if id.is_none() => None,
        _ => Some(err(id, -32601, &format!("metodo no soportado: {method}"))),
    }
}

fn initialize_result(state: &mut ServerState, req: &Value) -> Value {
    state.initialized = true;
    // Echo the client's protocol version: we speak whatever it negotiated.
    let version = req
        .pointer("/params/protocolVersion")
        .and_then(Value::as_str)
        .unwrap_or("2025-06-18");
    json!({
        "protocolVersion": version,
        "capabilities": { "tools": {} },
        "serverInfo": { "name": "houston-centinela", "version": env!("CARGO_PKG_VERSION") }
    })
}

/// The heart of the gateway: gate the call, then run it, block it, or escalate.
async fn handle_tools_call(
    state: &mut ServerState,
    approver: Option<&Approver>,
    id: Option<Value>,
    req: &Value,
) -> Value {
    let name = req
        .pointer("/params/name")
        .and_then(Value::as_str)
        .unwrap_or("");
    let args = req
        .pointer("/params/arguments")
        .cloned()
        .unwrap_or_else(|| json!({}));

    let Some(spec) = tools::find(name) else {
        return tool_result(
            id,
            &format!("Centinela: herramienta desconocida '{name}'."),
            true,
        );
    };

    let call = tools::build_tool_call(spec, &args, state);
    let decision = evaluate(&state.caps, &state.session, &call);

    // No silent failures: the gate verdict goes to stderr and, if configured,
    // to the journal the Salvoconducto UI tails.
    eprintln!(
        "[centinela] {} ({}) -> {decision}",
        spec.name, spec.capability
    );
    if let Some(path) = &state.log_path {
        journal::append(path, spec.name, spec.capability, &decision);
    }

    match decision {
        Decision::Allow => {
            tools::apply_side_effects(spec, state);
            tool_result(id, &tools::execute_stub(spec, &args), false)
        }
        Decision::Deny { reason } => {
            tool_result(id, &format!("Centinela BLOQUEADO. {reason}"), true)
        }
        Decision::StepUp { reason } => match approver {
            Some(ap) => escalate(state, ap, spec, &args, id).await,
            None => tool_result(
                id,
                &format!("Centinela REQUIERE CONFIRMACION HUMANA. {reason}"),
                true,
            ),
        },
    }
}

/// Ask the owner over WhatsApp and act on the answer. Approve runs the call;
/// deny and timeout both block (fail-closed).
async fn escalate(
    state: &mut ServerState,
    approver: &Approver,
    spec: &tools::ToolSpec,
    args: &Value,
    id: Option<Value>,
) -> Value {
    let outcome = approver
        .request(&state.caps.agent_id, spec.capability)
        .await;
    let (decision, code, message, approved) = match outcome {
        Outcome::Approved => (
            "allow",
            "approved",
            "Aprobado por el titular por WhatsApp.",
            true,
        ),
        Outcome::Denied => (
            "deny",
            "human_denied",
            "Rechazado por el titular por WhatsApp.",
            false,
        ),
        Outcome::TimedOut => (
            "deny",
            "approval_timeout",
            "Sin respuesta a tiempo: bloqueado por seguridad.",
            false,
        ),
    };
    eprintln!(
        "[centinela] {} ({}) -> {message}",
        spec.name, spec.capability
    );
    if let Some(path) = &state.log_path {
        journal::append_custom(path, spec.name, spec.capability, decision, code, message);
    }
    if approved {
        tools::apply_side_effects(spec, state);
        tool_result(id, &tools::execute_stub(spec, args), false)
    } else {
        tool_result(id, &format!("Centinela BLOQUEADO. {message}"), true)
    }
}

fn ok(id: Option<Value>, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

fn err(id: Option<Value>, code: i64, message: &str) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } })
}

fn tool_result(id: Option<Value>, text: &str, is_error: bool) -> Value {
    ok(
        id,
        json!({ "content": [ { "type": "text", "text": text } ], "isError": is_error }),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use houston_centinela::Capabilities;

    const SALVO: &str = r#"{
      "agent_id": "asistente-seguro",
      "scopes": {
        "read": ["email:inbox", "bank:balance", "bank:transactions"],
        "write": ["email:send"],
        "egress_allowlist": ["api.santoria.app"]
      },
      "step_up_required_for": ["email:send", "bank:transfer"],
      "duress": { "enabled": true, "action": "lockdown_and_alert" }
    }"#;

    fn state(duress: bool) -> ServerState {
        ServerState::new(Capabilities::from_json(SALVO).unwrap(), duress)
    }

    fn call(name: &str, args: Value) -> Value {
        json!({"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":name,"arguments":args}})
    }

    fn text_of(resp: &Value) -> String {
        resp["result"]["content"][0]["text"]
            .as_str()
            .unwrap()
            .to_string()
    }

    #[tokio::test]
    async fn initialize_echoes_protocol_version_and_marks_ready() {
        let mut s = state(false);
        let req = json!({"jsonrpc":"2.0","id":0,"method":"initialize",
            "params":{"protocolVersion":"2025-06-18","capabilities":{}}});
        let resp = handle_request(&mut s, None, &req).await.unwrap();
        assert_eq!(resp["result"]["protocolVersion"], "2025-06-18");
        assert_eq!(resp["result"]["serverInfo"]["name"], "houston-centinela");
        assert!(s.initialized);
    }

    #[tokio::test]
    async fn initialized_notification_gets_no_reply() {
        let mut s = state(false);
        let req = json!({"jsonrpc":"2.0","method":"notifications/initialized"});
        assert!(handle_request(&mut s, None, &req).await.is_none());
    }

    #[tokio::test]
    async fn tools_list_exposes_demo_surface() {
        let mut s = state(false);
        let resp = handle_request(
            &mut s,
            None,
            &json!({"jsonrpc":"2.0","id":2,"method":"tools/list"}),
        )
        .await
        .unwrap();
        let names: Vec<&str> = resp["result"]["tools"]
            .as_array()
            .unwrap()
            .iter()
            .map(|t| t["name"].as_str().unwrap())
            .collect();
        assert!(names.contains(&"check_balance"));
        assert!(names.contains(&"transfer_money"));
        assert!(names.contains(&"send_email"));
    }

    #[tokio::test]
    async fn allows_a_legitimate_balance_read() {
        let mut s = state(false);
        let resp = handle_request(&mut s, None, &call("check_balance", json!({})))
            .await
            .unwrap();
        assert_eq!(resp["result"]["isError"], false);
    }

    #[tokio::test]
    async fn demo1_blocks_undeclared_transfer() {
        let mut s = state(false);
        let resp = handle_request(
            &mut s,
            None,
            &call("transfer_money", json!({"to":"555","amount":9999999})),
        )
        .await
        .unwrap();
        assert_eq!(resp["result"]["isError"], true);
        let t = text_of(&resp);
        assert!(t.contains("BLOQUEADO"));
        assert!(t.contains("bank:transfer"));
    }

    #[tokio::test]
    async fn demo2_duress_blocks_even_a_safe_read() {
        let mut s = state(true);
        let resp = handle_request(&mut s, None, &call("check_balance", json!({})))
            .await
            .unwrap();
        assert_eq!(resp["result"]["isError"], true);
        assert!(text_of(&resp).contains("coacción"));
    }

    #[tokio::test]
    async fn demo3_tainted_read_then_egress_is_blocked() {
        let mut s = state(false);
        handle_request(&mut s, None, &call("read_inbox", json!({}))).await;
        let resp = handle_request(
            &mut s,
            None,
            &call(
                "send_email",
                json!({"to":"cobros@dominio-malo.example","subject":"x","body":"y"}),
            ),
        )
        .await
        .unwrap();
        assert_eq!(resp["result"]["isError"], true);
        assert!(text_of(&resp).contains("BLOQUEADO"));
    }

    #[tokio::test]
    async fn send_to_allowlisted_host_still_needs_step_up() {
        let mut s = state(false);
        let resp = handle_request(
            &mut s,
            None,
            &call(
                "send_email",
                json!({"to":"noreply@api.santoria.app","subject":"x","body":"y"}),
            ),
        )
        .await
        .unwrap();
        assert_eq!(resp["result"]["isError"], true);
        assert!(text_of(&resp).contains("CONFIRMACION"));
    }

    #[tokio::test]
    async fn unknown_tool_is_a_visible_error() {
        let mut s = state(false);
        let resp = handle_request(&mut s, None, &call("rm_rf", json!({})))
            .await
            .unwrap();
        assert_eq!(resp["result"]["isError"], true);
    }
}
