//! The reply + enrollment HTTP server. WhatsApp's webhook posts replies here,
//! and the Salvoconducto UI calls the enrollment endpoints to verify the owner's
//! number. It only ever resolves approvals or verifies a number; it never grants
//! a capability on its own.

use crate::approval::ApprovalRegistry;
use crate::enrollment::Enrollment;
use crate::notifier::Notifier;
use crate::tools;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::Html;
use axum::routing::{get, post};
use axum::{Json, Router};
use houston_centinela::Capabilities;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tower_http::cors::CorsLayer;

/// Everything the webhook needs, assembled by the gateway and handed to
/// [`serve`]. Carries the base salvoconducto and the live permission overrides
/// so the UI can read and toggle the agent's permissions.
#[derive(Clone)]
pub struct Web {
    pub registry: Arc<ApprovalRegistry>,
    pub verify_token: String,
    pub notifier: Option<Arc<dyn Notifier>>,
    pub enrollment: Arc<Enrollment>,
    pub log_path: Option<PathBuf>,
    pub inspect_content: Arc<AtomicBool>,
    pub caps: Capabilities,
    pub overrides: Arc<Mutex<HashMap<String, bool>>>,
}

/// Serve the webhook, fallback links, enrollment, the live decisions feed, and
/// the content-inspection + permission toggles. Runs whenever the gateway runs:
/// the UI endpoints work without WhatsApp; the reply and enrollment endpoints
/// no-op when `notifier` is `None`.
pub async fn serve(addr: SocketAddr, web: Web) {
    let app = Router::new()
        .route("/webhook", get(verify).post(incoming))
        .route("/approve", get(approve))
        .route("/deny", get(deny))
        .route("/enroll/start", post(enroll_start))
        .route("/enroll/confirm", post(enroll_confirm))
        .route("/decisions", get(decisions))
        .route("/inspect", get(inspect_get))
        .route("/toggle/inspect", post(inspect_toggle))
        .route("/permissions", get(permissions_get))
        .route("/toggle/permission", post(permission_toggle))
        .route("/demo/request", post(demo_request))
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
struct InspectToggle {
    on: bool,
}

/// Current state of the content-inspection toggle, for the UI to reflect.
async fn inspect_get(State(web): State<Web>) -> Json<Value> {
    Json(json!({ "on": web.inspect_content.load(Ordering::Relaxed) }))
}

/// Flip the content-inspection toggle. The Salvoconducto UI calls this so the
/// owner turns data-leak inspection on or off per agent, live.
async fn inspect_toggle(State(web): State<Web>, Json(req): Json<InspectToggle>) -> Json<Value> {
    web.inspect_content.store(req.on, Ordering::Relaxed);
    eprintln!(
        "[centinela] inspeccion de contenido: {}",
        if req.on { "ON" } else { "OFF" }
    );
    Json(json!({ "on": req.on }))
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
    let Some(notifier) = web.notifier.as_ref() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "status": "error", "message": "WhatsApp no configurado" })),
        );
    };
    let code = web.enrollment.start(number);
    match notifier.send_otp(number, &code).await {
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

#[derive(Deserialize)]
struct PermissionToggle {
    capability: String,
    on: bool,
}

/// The effective permission state for the tool catalog: the base salvoconducto
/// with the owner's live toggles applied. The UI renders a switch per capability.
async fn permissions_get(State(web): State<Web>) -> Json<Value> {
    let caps = effective_caps(&web);
    let perms: Vec<Value> = tools::catalog()
        .iter()
        .map(|t| {
            json!({
                "capability": t.capability,
                "granted": caps.declares(t.capability),
                "stepUp": caps.requires_step_up(t.capability),
            })
        })
        .collect();
    Json(json!(perms))
}

/// Grant or revoke a capability. The gate reads the overrides on the next call,
/// so a revoke takes effect immediately, no restart.
async fn permission_toggle(
    State(web): State<Web>,
    Json(req): Json<PermissionToggle>,
) -> Json<Value> {
    if let Ok(mut overrides) = web.overrides.lock() {
        overrides.insert(req.capability.clone(), req.on);
    }
    eprintln!(
        "[centinela] permiso {} -> {}",
        req.capability,
        if req.on { "OTORGADO" } else { "REVOCADO" }
    );
    Json(json!({ "capability": req.capability, "granted": req.on }))
}

/// The base salvoconducto with the live permission overrides applied.
fn effective_caps(web: &Web) -> Capabilities {
    let mut caps = web.caps.clone();
    if let Ok(overrides) = web.overrides.lock() {
        for (cap, granted) in overrides.iter() {
            caps.set_capability(cap, *granted);
        }
    }
    caps
}

#[derive(Deserialize)]
struct DemoRequest {
    #[serde(default = "default_agent")]
    agent: String,
    /// A plain-language description of what the agent wants to do.
    action: String,
}

fn default_agent() -> String {
    "asistente-seguro".to_string()
}

/// Demo trigger: simulate an agent asking to do something sensitive. Sends the
/// WhatsApp approval to the verified owner and blocks until they reply SI or NO,
/// so a single terminal command drives the whole step-up flow.
async fn demo_request(
    State(web): State<Web>,
    Json(req): Json<DemoRequest>,
) -> (StatusCode, Json<Value>) {
    let Some(notifier) = web.notifier.as_ref() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "outcome": "error", "message": "WhatsApp no configurado" })),
        );
    };
    let approver = crate::approver::Approver::with_registry(
        web.registry.clone(),
        notifier.clone(),
        web.enrollment.clone(),
    );
    let outcome = approver.request(&req.agent, &req.action).await;
    let (decision, code, message, label) = match outcome {
        crate::approval::Outcome::Approved => (
            "allow",
            "approved",
            "Aprobado por el titular por WhatsApp.",
            "approved",
        ),
        crate::approval::Outcome::Denied => (
            "deny",
            "human_denied",
            "Rechazado por el titular por WhatsApp.",
            "denied",
        ),
        crate::approval::Outcome::TimedOut => (
            "deny",
            "approval_timeout",
            "Sin respuesta a tiempo: bloqueado por seguridad.",
            "timeout",
        ),
    };
    if let Some(path) = &web.log_path {
        crate::journal::append_custom(path, "demo", &req.action, decision, code, message);
    }
    (
        StatusCode::OK,
        Json(json!({ "outcome": label, "message": message })),
    )
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
