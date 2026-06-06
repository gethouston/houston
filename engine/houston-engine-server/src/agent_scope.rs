//! Airlock L7 — per-agent authorization.
//!
//! The OS layers (L1-L5) stop a *process* from reaching another tenant's data.
//! They do nothing about a *client* asking the engine, over the API, to act on
//! another agent: today one `HOUSTON_ENGINE_TOKEN` (or any device token) can
//! start a session for, or read the files of, ANY agent. This module adds
//! capability tokens scoped to a single agent path, enforced in the auth
//! middleware so it can't be forgotten at a route.
//!
//! ## Capability token = HMAC(agent_path)
//!
//! A scoped token is `hsta_<b64url(agent_path)>.<b64url(HMAC-SHA256(key,
//! agent_path))>`, keyed by the engine's bootstrap secret. It is:
//! - **unforgeable** — only the engine (which holds the key) can mint one;
//! - **self-describing** — the scope is the token, so no DB row / migration;
//! - **stateless** — validation recomputes the MAC and constant-time compares.
//!
//! Revocation is by rotating the engine secret (documented limitation; a
//! persisted, individually-revocable variant is future work). Full-access
//! tokens (bootstrap + paired device tokens) are unchanged and unscoped.
//!
//! ## Enforcement (fail-closed)
//!
//! [`is_authorized`] lets `Full` through everywhere. An `Agent`-scoped token is
//! allowed ONLY on `/health`, `/version`, and requests whose target agent —
//! parsed from the `/agents/{agent_path}/…` path segment or an `?agent_path=`
//! query — matches its scope. Everything else (the WS firehose, workspace
//! listings, body-addressed routes where the target isn't in the URI) is
//! denied. Denying-when-unsure is deliberate: a scoped token must never reach
//! another tenant, so an unrecognised shape fails closed.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine as _;
use hmac::{Hmac, Mac};
use sha2::Sha256;
use std::path::PathBuf;

type HmacSha256 = Hmac<Sha256>;

/// Prefix marking a scoped capability token on the wire.
pub const SCOPED_PREFIX: &str = "hsta_";

/// The access a presented bearer grants.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Scope {
    /// Bootstrap token or paired device token — unrestricted (legacy behavior).
    Full,
    /// Capability token scoped to exactly one agent path.
    Agent(String),
}

/// Mint a capability token scoped to `agent_path`, keyed by the engine secret.
pub fn mint_agent_token(key: &str, agent_path: &str) -> String {
    let mac = sign(key, agent_path);
    format!(
        "{SCOPED_PREFIX}{}.{}",
        URL_SAFE_NO_PAD.encode(agent_path.as_bytes()),
        URL_SAFE_NO_PAD.encode(mac),
    )
}

/// Validate a presented token as a scoped capability token. Returns the agent
/// path it is scoped to when the prefix is present AND the HMAC verifies under
/// `key`; otherwise `None` (caller falls through to bootstrap / device checks).
pub fn parse_agent_token(key: &str, token: &str) -> Option<String> {
    let body = token.strip_prefix(SCOPED_PREFIX)?;
    let (path_b64, mac_b64) = body.split_once('.')?;
    let path_bytes = URL_SAFE_NO_PAD.decode(path_b64).ok()?;
    let agent_path = String::from_utf8(path_bytes).ok()?;
    let presented_mac = URL_SAFE_NO_PAD.decode(mac_b64).ok()?;

    // Constant-time verification via the MAC's own verify_slice.
    let mut mac = HmacSha256::new_from_slice(key.as_bytes()).ok()?;
    mac.update(agent_path.as_bytes());
    mac.verify_slice(&presented_mac).ok()?;
    Some(agent_path)
}

fn sign(key: &str, agent_path: &str) -> Vec<u8> {
    let mut mac =
        HmacSha256::new_from_slice(key.as_bytes()).expect("HMAC accepts keys of any length");
    mac.update(agent_path.as_bytes());
    mac.finalize().into_bytes().to_vec()
}

/// Outcome of an authorization check.
#[derive(Debug, PartialEq, Eq)]
pub enum Authz {
    Allow,
    Deny,
}

/// Authorize a request URI under a scope. See the module-level fail-closed
/// rules.
pub fn is_authorized(scope: &Scope, uri: &axum::http::Uri) -> Authz {
    let allowed = match scope {
        Scope::Full => return Authz::Allow,
        Scope::Agent(path) => path,
    };

    let path = strip_v1(uri.path());
    if path == "/health" || path == "/version" {
        return Authz::Allow;
    }

    match request_target(uri) {
        Some(target) if normalize(&target) == normalize(allowed) => Authz::Allow,
        _ => Authz::Deny,
    }
}

/// Extract the agent the request targets: the `/agents/{agent_path}/sessions…`
/// path segment (the only path-param agent route family, percent-decoded), then
/// an `?agent_path=` query parameter.
///
/// The `/agents/` namespace also holds many *static* sub-paths whose agent is
/// in the query or body — `/agents/files`, `/agents/config`, `/agents/routines`,
/// `/agents/portable/…`, `/agents/install-from-github`, … — so the path
/// extractor only fires when the segment after the agent is literally
/// `sessions`. Everything else falls through to the query (or to `None`).
pub fn request_target(uri: &axum::http::Uri) -> Option<String> {
    let path = strip_v1(uri.path());
    if let Some(rest) = path.strip_prefix("/agents/") {
        let mut segs = rest.split('/');
        let first = segs.next().unwrap_or("");
        let second = segs.next().unwrap_or("");
        if !first.is_empty() && second == "sessions" {
            return Some(percent_decode(first));
        }
    }
    if let Some(query) = uri.query() {
        for kv in query.split('&') {
            if let Some(v) = kv.strip_prefix("agent_path=") {
                return Some(percent_decode(v));
            }
        }
    }
    None
}

fn strip_v1(path: &str) -> &str {
    // The auth layer may see the path with or without the `/v1` nest prefix
    // depending on layer ordering; tolerate both.
    path.strip_prefix("/v1").unwrap_or(path)
}

/// Normalize an agent path for comparison: trim and expand a leading `~/` the
/// same way the route handlers do, so a scope minted as `~/.houston/…` matches
/// a request that spells the same path.
fn normalize(agent_path: &str) -> PathBuf {
    houston_engine_core::paths::expand_tilde(std::path::Path::new(agent_path.trim()))
}

/// Percent-decode a single path/query token (`%XX` only; no `+` → space, which
/// would corrupt filesystem paths).
fn percent_decode(s: &str) -> String {
    let mut out = Vec::with_capacity(s.len());
    let mut bytes = s.bytes();
    while let Some(b) = bytes.next() {
        if b == b'%' {
            match (bytes.next(), bytes.next()) {
                (Some(a), Some(c)) => match (hex(a), hex(c)) {
                    (Some(x), Some(y)) => out.push((x << 4) | y),
                    _ => {
                        out.push(b'%');
                        out.push(a);
                        out.push(c);
                    }
                },
                _ => out.push(b'%'),
            }
        } else {
            out.push(b);
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn hex(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const KEY: &str = "engine-bootstrap-secret";

    fn uri(s: &str) -> axum::http::Uri {
        s.parse().unwrap()
    }

    #[test]
    fn mint_then_parse_roundtrips() {
        let path = "~/.houston/workspaces/Acme/Bookkeeper";
        let token = mint_agent_token(KEY, path);
        assert!(token.starts_with(SCOPED_PREFIX));
        assert_eq!(parse_agent_token(KEY, &token).as_deref(), Some(path));
    }

    #[test]
    fn forged_or_wrong_key_token_is_rejected() {
        let token = mint_agent_token(KEY, "~/.houston/workspaces/Acme/A");
        // Wrong key → no scope.
        assert_eq!(parse_agent_token("other-key", &token), None);
        // Tampered MAC → no scope.
        let tampered = format!("{token}xx");
        assert_eq!(parse_agent_token(KEY, &tampered), None);
        // A hand-built token without a valid MAC is rejected (can't forge
        // a scope for agent B without the key).
        let forged = format!(
            "{SCOPED_PREFIX}{}.{}",
            URL_SAFE_NO_PAD.encode("~/.houston/workspaces/Victim/B"),
            URL_SAFE_NO_PAD.encode("not-a-real-mac"),
        );
        assert_eq!(parse_agent_token(KEY, &forged), None);
    }

    #[test]
    fn full_scope_allowed_everywhere() {
        for u in [
            "/v1/agents/~%2F.houston%2FA/sessions",
            "/v1/ws",
            "/v1/workspaces",
        ] {
            assert_eq!(is_authorized(&Scope::Full, &uri(u)), Authz::Allow);
        }
    }

    #[test]
    fn agent_scope_allows_own_denies_others() {
        let scope = Scope::Agent("~/.houston/workspaces/Acme/A".into());
        // Own agent session (path segment, percent-encoded) → allow.
        let own = uri("/v1/agents/~%2F.houston%2Fworkspaces%2FAcme%2FA/sessions");
        assert_eq!(is_authorized(&scope, &own), Authz::Allow);
        // Another agent's session → deny.
        let other = uri("/v1/agents/~%2F.houston%2Fworkspaces%2FAcme%2FB/sessions");
        assert_eq!(is_authorized(&scope, &other), Authz::Deny);
    }

    #[test]
    fn agent_scope_fails_closed_on_untargeted_routes() {
        let scope = Scope::Agent("~/.houston/workspaces/Acme/A".into());
        // WS firehose and workspace listing carry no agent target → deny.
        assert_eq!(is_authorized(&scope, &uri("/v1/ws")), Authz::Deny);
        assert_eq!(is_authorized(&scope, &uri("/v1/workspaces")), Authz::Deny);
        // Health/version are harmless and allowed.
        assert_eq!(is_authorized(&scope, &uri("/v1/health")), Authz::Allow);
    }

    #[test]
    fn agent_scope_matches_query_param_target() {
        let scope = Scope::Agent("~/.houston/workspaces/Acme/A".into());
        // `/agents/files` is a static route (not `/agents/{agent}/sessions`),
        // so the agent comes from the query param — which the extractor reads.
        let own = uri("/v1/agents/files?agent_path=~%2F.houston%2Fworkspaces%2FAcme%2FA");
        assert_eq!(is_authorized(&scope, &own), Authz::Allow);
        let other = uri("/v1/agents/files?agent_path=~%2F.houston%2Fworkspaces%2FAcme%2FB");
        assert_eq!(is_authorized(&scope, &other), Authz::Deny);
        // A static route that puts the agent in the BODY (not the URI) fails
        // closed for a scoped token.
        let body_route = uri("/v1/agents/files/write");
        assert_eq!(is_authorized(&scope, &body_route), Authz::Deny);
    }
}
