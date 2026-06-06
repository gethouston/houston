//! Centinela MCP gateway binary.
//!
//! Speaks MCP (JSON-RPC 2.0, newline-delimited) over stdio so any MCP client,
//! including the Claude CLI that Houston spawns, can point at it with
//! `--mcp-config`. Every tool call the agent makes is gated by the Centinela
//! Policy Core before it runs. The model only ever sees this endpoint, so it
//! cannot reach the underlying tools except through the gate.
//!
//! Config via env:
//!   CENTINELA_SALVOCONDUCTO  path to a capabilities.json (else a demo default)
//!   CENTINELA_DURESS=1       arm the lockdown latch (user typed the panic word)

mod approval;
mod approver;
mod auditor;
mod enrollment;
mod journal;
mod notifier;
mod profile;
mod server;
mod state;
mod tools;
mod webhook;
mod whatsapp;

use houston_centinela::Capabilities;
use notifier::Notifier;
use state::ServerState;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

/// Demo salvoconducto used when CENTINELA_SALVOCONDUCTO is not set.
const DEFAULT_SALVOCONDUCTO: &str = r#"{
  "agent_id": "asistente-seguro",
  "version": "1.0",
  "scopes": {
    "read": ["email:inbox", "bank:balance", "bank:transactions"],
    "write": ["email:send", "agent:relay"],
    "money": [],
    "egress_allowlist": ["api.santoria.app", "asistente-contable"]
  },
  "rule_of_two": { "untrusted_input": true, "sensitive_data": true, "external_action": false },
  "step_up_required_for": ["email:send", "bank:transfer", "agent:relay"],
  "duress": { "enabled": true, "action": "lockdown_and_alert" }
}"#;

#[tokio::main]
async fn main() {
    let caps = load_salvoconducto();
    let duress = matches!(
        std::env::var("CENTINELA_DURESS").as_deref(),
        Ok("1") | Ok("true")
    );
    let log_path = std::env::var_os("CENTINELA_LOG").map(std::path::PathBuf::from);
    // Content-inspection toggle, shared with the webhook so the UI flips it live.
    let inspect = Arc::new(std::sync::atomic::AtomicBool::new(matches!(
        std::env::var("CENTINELA_INSPECT").as_deref(),
        Ok("1") | Ok("true")
    )));
    let mut state = ServerState::new(caps, duress)
        .with_log(log_path.clone())
        .with_inspect(inspect.clone());
    eprintln!(
        "[centinela] gateway MCP activo para '{}' (duress={duress})",
        state.caps.agent_id
    );

    // The approval trust anchor: seeded from WHATSAPP_RECIPIENT (set by the
    // trusted operator, out of band) and replaceable only through OTP-verified
    // enrollment. The agent can never reach or change it.
    let enrollment = Arc::new(enrollment::Enrollment::new(
        std::env::var("WHATSAPP_RECIPIENT")
            .ok()
            .filter(|v| !v.trim().is_empty()),
    ));

    // WhatsApp is the Notifier. The Approver handles step-ups; the Auditor
    // alerts the owner on bypass attempts. Both talk through it; absent
    // credentials disable the human channels (step-up blocks, no alerts).
    let notifier: Option<Arc<dyn Notifier>> =
        whatsapp::WhatsApp::from_env().map(|wa| Arc::new(wa) as Arc<dyn Notifier>);
    let approver = notifier
        .as_ref()
        .map(|n| approver::Approver::new(n.clone(), enrollment.clone()));
    let auditor = notifier
        .as_ref()
        .map(|n| auditor::Auditor::new(n.clone(), enrollment.clone()));
    match (&approver, &notifier) {
        (Some(ap), Some(n)) => {
            let port: u16 = std::env::var("CENTINELA_WEBHOOK_PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(8787);
            let verify_token =
                std::env::var("WHATSAPP_VERIFY_TOKEN").unwrap_or_else(|_| "centinela".to_string());
            let addr = std::net::SocketAddr::from(([0, 0, 0, 0], port));
            tokio::spawn(webhook::serve(
                addr,
                ap.registry(),
                verify_token,
                n.clone(),
                enrollment.clone(),
                log_path.clone(),
                inspect.clone(),
            ));
            eprintln!(
                "[centinela] approver + auditor WhatsApp activos; webhook + enrolamiento en :{port}"
            );
        }
        _ => eprintln!(
            "[centinela] canales WhatsApp desactivados (faltan WHATSAPP_TOKEN/PHONE_NUMBER_ID); el step-up bloquea y no hay alertas"
        ),
    }

    let mut lines = BufReader::new(tokio::io::stdin()).lines();
    let mut stdout = tokio::io::stdout();
    loop {
        let line = match lines.next_line().await {
            Ok(Some(l)) => l,
            Ok(None) => break,
            Err(e) => {
                eprintln!("[centinela] error leyendo stdin: {e}");
                break;
            }
        };
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let request: serde_json::Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(e) => {
                eprintln!("[centinela] JSON-RPC invalido, ignorado: {e}");
                continue;
            }
        };
        let hooks = server::Hooks {
            approver: approver.as_ref(),
            auditor: auditor.as_ref(),
        };
        if let Some(response) = server::handle_request(&mut state, &hooks, &request).await {
            let mut payload = serde_json::to_string(&response).expect("response is serializable");
            payload.push('\n');
            if stdout.write_all(payload.as_bytes()).await.is_err() || stdout.flush().await.is_err()
            {
                break;
            }
        }
    }
}

/// Load the salvoconducto from CENTINELA_SALVOCONDUCTO, or fall back to the
/// bundled demo. A configured-but-unreadable path is fatal and fail-closed: we
/// refuse to run permissively when the operator asked for a specific policy.
fn load_salvoconducto() -> Capabilities {
    match std::env::var("CENTINELA_SALVOCONDUCTO") {
        Ok(path) => match Capabilities::from_path(&path) {
            Ok(caps) => caps,
            Err(e) => {
                eprintln!("[centinela] no se pudo cargar el salvoconducto '{path}': {e}");
                std::process::exit(1);
            }
        },
        Err(_) => Capabilities::from_json(DEFAULT_SALVOCONDUCTO)
            .expect("el salvoconducto de demo embebido debe ser valido"),
    }
}
