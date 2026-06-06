//! The demo tool surface the gateway exposes over MCP, plus the mapping from a
//! tool name to the capability terms the gate reasons about.
//!
//! These stand in for the real Composio toolkits (Gmail, bank). The gateway
//! gates them identically; swapping the stub execution for a forwarded call to
//! the upstream Composio MCP server is the only change needed in production.

use crate::state::ServerState;
use houston_centinela::ToolCall;
use serde_json::{json, Value};

/// One exposed tool and how it maps onto a capability and risk properties.
pub struct ToolSpec {
    pub name: &'static str,
    pub description: &'static str,
    pub capability: &'static str,
    pub is_egress: bool,
    pub marks_untrusted: bool,
    pub marks_sensitive: bool,
}

/// The full catalog. `transfer_money` is deliberately present but maps to a
/// capability the demo salvoconducto never declares, so the gate denies it.
pub fn catalog() -> &'static [ToolSpec] {
    &[
        ToolSpec {
            name: "read_inbox",
            description: "Lee los correos recientes del usuario.",
            capability: "email:inbox",
            is_egress: false,
            marks_untrusted: true,
            marks_sensitive: false,
        },
        ToolSpec {
            name: "check_balance",
            description: "Consulta el saldo bancario del usuario.",
            capability: "bank:balance",
            is_egress: false,
            marks_untrusted: false,
            marks_sensitive: true,
        },
        ToolSpec {
            name: "list_transactions",
            description: "Lista los movimientos bancarios del usuario.",
            capability: "bank:transactions",
            is_egress: false,
            marks_untrusted: false,
            marks_sensitive: true,
        },
        ToolSpec {
            name: "transfer_money",
            description: "Transfiere dinero a una cuenta destino.",
            capability: "bank:transfer",
            is_egress: false,
            marks_untrusted: false,
            marks_sensitive: true,
        },
        ToolSpec {
            name: "send_email",
            description: "Envia un correo a un destinatario.",
            capability: "email:send",
            is_egress: true,
            marks_untrusted: false,
            marks_sensitive: false,
        },
        // Agent-to-agent communication is just another egress: it passes the
        // same gate. An agent can read sensitive data but cannot relay it to an
        // agent that is not a cleared destination. Having access is not the same
        // as being able to export.
        ToolSpec {
            name: "relay_to_agent",
            description: "Comparte informacion con otro agente.",
            capability: "agent:relay",
            is_egress: true,
            marks_untrusted: false,
            marks_sensitive: false,
        },
    ]
}

pub fn find(name: &str) -> Option<&'static ToolSpec> {
    catalog().iter().find(|t| t.name == name)
}

/// The `tools/list` payload: name, description and a minimal input schema.
pub fn list_json() -> Vec<Value> {
    catalog()
        .iter()
        .map(|t| {
            json!({
                "name": t.name,
                "description": t.description,
                "inputSchema": input_schema(t),
            })
        })
        .collect()
}

fn input_schema(spec: &ToolSpec) -> Value {
    match spec.name {
        "transfer_money" => json!({
            "type": "object",
            "properties": {
                "to": { "type": "string", "description": "Cuenta o destinatario." },
                "amount": { "type": "number", "description": "Monto a transferir." }
            },
            "required": ["to", "amount"]
        }),
        "relay_to_agent" => json!({
            "type": "object",
            "properties": {
                "to": { "type": "string", "description": "Agente destino." },
                "message": { "type": "string", "description": "Lo que se comparte." }
            },
            "required": ["to", "message"]
        }),
        "send_email" => json!({
            "type": "object",
            "properties": {
                "to": { "type": "string", "description": "Correo del destinatario." },
                "subject": { "type": "string" },
                "body": { "type": "string" }
            },
            "required": ["to"]
        }),
        _ => json!({ "type": "object", "properties": {} }),
    }
}

/// Normalise a pending call into the capability terms the gate evaluates.
pub fn build_tool_call(spec: &ToolSpec, args: &Value, state: &ServerState) -> ToolCall {
    let egress_dest = if spec.is_egress {
        args.get("to").and_then(Value::as_str).map(domain_of)
    } else {
        None
    };
    // Outbound content to inspect for secrets: all the call's text arguments.
    let payload = if spec.is_egress {
        Some(collect_text(args))
    } else {
        None
    };
    ToolCall {
        capability: spec.capability.to_string(),
        is_egress: spec.is_egress,
        egress_dest,
        inputs_tainted: state.tainted,
        sink_sensitive: false,
        payload,
    }
}

/// Join every string value in the tool arguments, so the content scanner sees
/// the full outbound text (subject + body of an email, etc.).
fn collect_text(args: &Value) -> String {
    args.as_object()
        .map(|o| {
            o.values()
                .filter_map(Value::as_str)
                .collect::<Vec<_>>()
                .join(" ")
        })
        .unwrap_or_default()
}

/// After an allowed call, advance the session's risk state so later calls see
/// the accumulated picture (untrusted read -> taint, sensitive read, egress).
pub fn apply_side_effects(spec: &ToolSpec, state: &mut ServerState) {
    if spec.marks_untrusted {
        state.session.untrusted_input = true;
        state.tainted = true;
    }
    if spec.marks_sensitive {
        state.session.sensitive_data = true;
    }
    if spec.is_egress {
        state.session.external_action = true;
    }
}

/// Stand-in execution for an allowed call. In production this forwards to the
/// upstream Composio MCP server; here it returns believable demo data.
pub fn execute_stub(spec: &ToolSpec, args: &Value) -> String {
    let to = || args.get("to").and_then(Value::as_str).unwrap_or("destino");
    match spec.name {
        "read_inbox" => crate::profile::inbox().to_string(),
        "check_balance" => crate::profile::balance().to_string(),
        "list_transactions" => crate::profile::transactions().to_string(),
        "transfer_money" => format!("Transferencia ejecutada hacia {}.", to()),
        "send_email" => format!("Correo enviado a {}.", to()),
        _ => "ok".to_string(),
    }
}

/// Extract the host from an address. `cobros@dominio-malo.example` -> the
/// domain; a bare host stays as-is.
fn domain_of(addr: &str) -> String {
    match addr.rsplit_once('@') {
        Some((_, host)) => host.to_string(),
        None => addr.to_string(),
    }
}
