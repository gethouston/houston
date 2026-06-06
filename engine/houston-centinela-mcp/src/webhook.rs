//! The reply channel: a tiny HTTP server that Meta's WhatsApp webhook posts to,
//! plus browser fallback links for the stage. It only ever resolves pending
//! approvals; it never grants a capability on its own.

use crate::approval::ApprovalRegistry;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::Html;
use axum::routing::get;
use axum::{Json, Router};
use serde_json::Value;
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;

#[derive(Clone)]
struct Web {
    registry: Arc<ApprovalRegistry>,
    verify_token: String,
}

/// Serve the webhook and fallback links on `addr` for the life of the process.
pub async fn serve(addr: SocketAddr, registry: Arc<ApprovalRegistry>, verify_token: String) {
    let web = Web {
        registry,
        verify_token,
    };
    let app = Router::new()
        .route("/webhook", get(verify).post(incoming))
        .route("/approve", get(approve))
        .route("/deny", get(deny))
        .with_state(web);
    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[centinela] no se pudo abrir el webhook en {addr}: {e}");
            return;
        }
    };
    if let Err(e) = axum::serve(listener, app).await {
        eprintln!("[centinela] el webhook se detuvo: {e}");
    }
}

/// Meta verification handshake: echo `hub.challenge` when the token matches.
async fn verify(
    State(web): State<Web>,
    Query(q): Query<HashMap<String, String>>,
) -> Result<String, StatusCode> {
    let token = q.get("hub.verify_token").map(String::as_str).unwrap_or("");
    if token == web.verify_token {
        Ok(q.get("hub.challenge").cloned().unwrap_or_default())
    } else {
        Err(StatusCode::FORBIDDEN)
    }
}

/// Incoming WhatsApp message: resolve the latest pending approval on SI / NO.
async fn incoming(State(web): State<Web>, Json(body): Json<Value>) -> StatusCode {
    if let Some(text) = first_message_text(&body) {
        let answer = text.trim().to_lowercase();
        if is_yes(&answer) {
            web.registry.resolve_latest(true);
        } else if is_no(&answer) {
            web.registry.resolve_latest(false);
        }
    }
    StatusCode::OK
}

async fn approve(State(web): State<Web>) -> Html<&'static str> {
    web.registry.resolve_latest(true);
    Html("<h2>Aprobado.</h2><p>Puedes cerrar esta pestana.</p>")
}

async fn deny(State(web): State<Web>) -> Html<&'static str> {
    web.registry.resolve_latest(false);
    Html("<h2>Rechazado.</h2><p>Puedes cerrar esta pestana.</p>")
}

/// Pull the first inbound message body out of a WhatsApp webhook payload.
fn first_message_text(body: &Value) -> Option<String> {
    body.pointer("/entry/0/changes/0/value/messages/0/text/body")
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn is_yes(s: &str) -> bool {
    matches!(s, "si" | "sí" | "s" | "yes" | "ok" | "dale")
}

fn is_no(s: &str) -> bool {
    matches!(s, "no" | "n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn extracts_message_text_from_webhook_payload() {
        let body = json!({
            "entry": [{ "changes": [{ "value": {
                "messages": [{ "text": { "body": "SI" } }]
            }}]}]
        });
        assert_eq!(first_message_text(&body).as_deref(), Some("SI"));
    }

    #[test]
    fn missing_message_is_none() {
        assert_eq!(first_message_text(&json!({"entry": []})), None);
    }

    #[test]
    fn yes_and_no_recognise_common_answers() {
        assert!(is_yes("si") && is_yes("sí") && is_yes("ok"));
        assert!(is_no("no") && is_no("n"));
        assert!(!is_yes("tal vez") && !is_no("quizas"));
    }
}
