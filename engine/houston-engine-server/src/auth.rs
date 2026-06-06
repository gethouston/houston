//! Bearer token auth middleware.
//!
//! Two token families are accepted:
//! 1. The **bootstrap token** in `ServerConfig::token` (env `HOUSTON_ENGINE_TOKEN`
//!    or auto-generated at boot). Desktop webview uses this.
//! 2. **Device-scoped tokens** stored in `engine_tokens` as SHA-256 hashes.
//!    Minted during mobile pairing; any mobile device holds its own bearer.
//!
//! Both paths are O(1). Bootstrap is constant-time-compared to the config
//! value; device tokens are hashed and checked against the DB's indexed PK.
//! A revoked device token fails fast (SQL `revoked_at IS NULL` filter).

use crate::agent_scope::{self, Authz, Scope};
use crate::state::ServerState;
use axum::{
    extract::{Request, State},
    http::{header, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use houston_engine_protocol::{ErrorBody, ErrorCode, ErrorDetail};
use sha2::{Digest, Sha256};
use std::sync::Arc;

pub async fn require_bearer(
    State(state): State<Arc<ServerState>>,
    mut req: Request,
    next: Next,
) -> Response {
    let presented = extract_bearer(&req);
    let Some(token) = presented else {
        return unauthorized();
    };

    // Determine the scope this bearer grants. Order matters: a scoped
    // capability token (`hsta_…`) is self-identifying by prefix, so check it
    // first and skip the DB; bootstrap is a constant-time compare; device
    // tokens are the async DB fallback. Bootstrap + device tokens are `Full`
    // (unchanged, unscoped); only valid capability tokens are `Agent`.
    let scope = if token.starts_with(agent_scope::SCOPED_PREFIX) {
        match agent_scope::parse_agent_token(&state.config.token, &token) {
            Some(path) => Scope::Agent(path),
            None => return unauthorized(),
        }
    } else if constant_time_eq(token.as_bytes(), state.config.token.as_bytes()) {
        Scope::Full
    } else {
        let hash = hash_hex(&token);
        match state.engine.db.touch_engine_token(&hash).await {
            Ok(Some(_)) => Scope::Full,
            _ => return unauthorized(),
        }
    };

    // L7 enforcement (fail-closed for Agent scope). See `agent_scope`.
    if agent_scope::is_authorized(&scope, req.uri()) == Authz::Deny {
        return forbidden();
    }

    // Hand the scope to downstream handlers (e.g. the mint route gates on it).
    req.extensions_mut().insert(scope);
    next.run(req).await
}

fn extract_bearer(req: &Request) -> Option<String> {
    // 1. Authorization header.
    if let Some(v) = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer "))
    {
        return Some(v.to_string());
    }
    // 2. Sec-WebSocket-Protocol (browsers can't set Authorization on WS).
    if let Some(v) = req
        .headers()
        .get("sec-websocket-protocol")
        .and_then(|v| v.to_str().ok())
    {
        for p in v.split(',').map(|p| p.trim()) {
            if let Some(t) = p.strip_prefix("houston-bearer.") {
                return Some(t.to_string());
            }
        }
    }
    // 3. ?token=<...>  query param (simple CLI clients).
    if let Some(q) = req.uri().query() {
        for kv in q.split('&') {
            if let Some(t) = kv.strip_prefix("token=") {
                return Some(urlencoding_decode(t));
            }
        }
    }
    None
}

/// Minimal URL-decoder — no external dep.
fn urlencoding_decode(s: &str) -> String {
    let mut out = Vec::with_capacity(s.len());
    let mut bytes = s.bytes();
    while let Some(b) = bytes.next() {
        if b == b'%' {
            let h1 = bytes.next();
            let h2 = bytes.next();
            if let (Some(a), Some(b)) = (h1, h2) {
                if let (Some(x), Some(y)) =
                    (hex_digit(a), hex_digit(b))
                {
                    out.push(x << 4 | y);
                    continue;
                }
            }
            out.push(b);
        } else if b == b'+' {
            out.push(b' ');
        } else {
            out.push(b);
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}
fn hex_digit(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

/// SHA-256 hex digest — what we store in `engine_tokens.token_hash`.
pub fn hash_hex(token: &str) -> String {
    let mut h = Sha256::new();
    h.update(token.as_bytes());
    let out = h.finalize();
    let mut s = String::with_capacity(out.len() * 2);
    for b in out.iter() {
        s.push_str(&format!("{b:02x}"));
    }
    s
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

fn unauthorized() -> Response {
    (
        StatusCode::UNAUTHORIZED,
        Json(ErrorBody {
            error: ErrorDetail {
                code: ErrorCode::Unauthorized,
                message: "Missing or invalid bearer token".into(),
                details: None,
            },
        }),
    )
        .into_response()
}

/// 403 for a valid token that is not authorized for the targeted agent — the
/// L7 boundary an agent-scoped capability token hits on another agent.
fn forbidden() -> Response {
    (
        StatusCode::FORBIDDEN,
        Json(ErrorBody {
            error: ErrorDetail {
                code: ErrorCode::Forbidden,
                message: "Token is not authorized for this agent".into(),
                details: None,
            },
        }),
    )
        .into_response()
}
