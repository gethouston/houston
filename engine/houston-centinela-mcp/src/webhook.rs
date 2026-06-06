//! The reply + enrollment HTTP server. WhatsApp's webhook posts replies here,
//! and the Salvoconducto UI calls the enrollment endpoints to verify the owner's
//! number. It only ever resolves approvals or verifies a number; it never grants
//! a capability on its own.

use crate::approval::ApprovalRegistry;
use crate::enrollment::Enrollment;
use crate::notifier::Notifier;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::Html;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use tower_http::cors::CorsLayer;

#[derive(Clone)]
struct Web {
    registry: Arc<ApprovalRegistry>,
    verify_token: String,
    notifier: Arc<dyn Notifier>,
    enrollment: Arc<Enrollment>,
    log_path: Option<PathBuf>,
}

/// Serve the webhook, fallback links, enrollment and decisions endpoints.
pub async fn serve(
    addr: SocketAddr,
    registry: Arc<ApprovalRegistry>,
    verify_token: String,
    notifier: Arc<dyn Notifier>,
    enrollment: Arc<Enrollment>,
    log_path: Option<PathBuf>,
) {
    let web = Web {
        registry,
        verify_token,
        notifier,
        enrollment,
        log_path,
    };
    let app = Router::new()
        .route("/webhook", get(verify).post(incoming))
        .route("/approve", get(approve))
        .route("/deny", get(deny))
        .route("/enroll/start", post(enroll_start))
        .route("/enroll/confirm", post(enroll_confirm))
        .route("/decisions", get(decisions))
        .layer(CorsLayer::permissive())
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

/// The decision journal as a JSON array (oldest first), for the Salvoconducto UI
/// and the Houston tab to render the live log. Empty when nothing logged yet.
async fn decisions(State(web): State<Web>) -> Json<Vec<Value>> {
    let entries = web
        .log_path
        .as_ref()
        .and_then(|path| std::fs::read_to_string(path).ok())
        .map(|raw| {
            raw.lines()
                .filter_map(|line| serde_json::from_str::<Value>(line).ok())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    Json(entries)
}

#[derive(Deserialize)]
struct EnrollStart {
    number: String,
}

#[derive(Deserialize)]
struct EnrollConfirm {
    number: String,
    code: String,
}

/// Begin enrollment: generate a code and send it to the candidate number. The
/// code is never returned in the response, only delivered over WhatsApp.
async fn enroll_start(
    State(web): State<Web>,
    Json(req): Json<EnrollStart>,
) -> (StatusCode, Json<Value>) {
    let number = req.number.trim();
    if number.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "status": "error", "message": "numero vacio" })),
        );
    }
    let code = web.enrollment.start(number);
    match web.notifier.send_otp(number, &code).await {
        Ok(()) => (StatusCode::OK, Json(json!({ "status": "sent" }))),
        Err(e) => (
            StatusCode::BAD_GATEWAY,
            Json(json!({ "status": "error", "message": e })),
        ),
    }
}

/// Confirm enrollment: a correct code verifies the number as the trust anchor.
async fn enroll_confirm(
    State(web): State<Web>,
    Json(req): Json<EnrollConfirm>,
) -> (StatusCode, Json<Value>) {
    let number = req.number.trim();
    if web.enrollment.confirm(number, req.code.trim()) {
        (
            StatusCode::OK,
            Json(json!({ "status": "verified", "number": number })),
        )
    } else {
        (
            StatusCode::BAD_REQUEST,
            Json(json!({ "status": "invalid" })),
        )
    }
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
