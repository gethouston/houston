//! The salvoconducto: the declared, signed-off set of capabilities an agent
//! has. This is the static half of the decision; [`crate::Session`] is the
//! live half.
//!
//! Parsed from `capabilities.json`. Missing arrays default to empty, which is
//! the fail-closed choice: an undeclared scope denies, never grants.

use serde::{Deserialize, Serialize};
use std::path::Path;

/// Everything an agent is permitted to do, as declared in its salvoconducto.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Capabilities {
    /// Which agent this salvoconducto belongs to. Required: a passport with no
    /// holder is not a passport.
    pub agent_id: String,
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub scopes: Scopes,
    #[serde(default)]
    pub rule_of_two: RuleOfTwo,
    #[serde(default)]
    pub step_up_required_for: Vec<String>,
    #[serde(default)]
    pub duress: Duress,
}

/// Capability scopes, OAuth-style. A capability is declared only if it appears
/// in `read`, `write` or `money`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Scopes {
    #[serde(default)]
    pub read: Vec<String>,
    #[serde(default)]
    pub write: Vec<String>,
    #[serde(default)]
    pub money: Vec<String>,
    /// Hosts the agent may send data to. Exact host or a parent domain.
    #[serde(default)]
    pub egress_allowlist: Vec<String>,
}

/// The declared Rule-of-Two baseline for this agent. The live decision uses the
/// session's runtime flags; this records the intended posture for display.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RuleOfTwo {
    #[serde(default)]
    pub untrusted_input: bool,
    #[serde(default)]
    pub sensitive_data: bool,
    #[serde(default)]
    pub external_action: bool,
}

/// Duress configuration: the pre-agreed panic posture.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Duress {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub action: String,
}

impl Capabilities {
    /// True if `cap` is declared in any scope (read, write or money).
    pub fn declares(&self, cap: &str) -> bool {
        self.scopes
            .read
            .iter()
            .chain(&self.scopes.write)
            .chain(&self.scopes.money)
            .any(|c| c == cap)
    }

    /// True if `dest` is the exact host or a subdomain of an allowlisted host.
    pub fn egress_allowed(&self, dest: &str) -> bool {
        self.scopes
            .egress_allowlist
            .iter()
            .any(|entry| host_matches(entry, dest))
    }

    /// True if `cap` may run only after explicit human step-up.
    pub fn requires_step_up(&self, cap: &str) -> bool {
        self.step_up_required_for.iter().any(|c| c == cap)
    }

    /// Grant or revoke `cap` at runtime. Revoking removes it from every scope;
    /// granting adds it to the write scope. The owner toggles this from the
    /// Salvoconducto UI to control the agent's permissions live and revocably.
    pub fn set_capability(&mut self, cap: &str, granted: bool) {
        self.scopes.read.retain(|c| c != cap);
        self.scopes.write.retain(|c| c != cap);
        self.scopes.money.retain(|c| c != cap);
        if granted {
            self.scopes.write.push(cap.to_string());
        }
    }

    /// Parse a salvoconducto from a JSON string.
    pub fn from_json(s: &str) -> Result<Self, CentinelaError> {
        Ok(serde_json::from_str(s)?)
    }

    /// Read and parse a salvoconducto from disk.
    pub fn from_path(path: impl AsRef<Path>) -> Result<Self, CentinelaError> {
        let raw = std::fs::read_to_string(path)?;
        Self::from_json(&raw)
    }
}

/// `dest` matches `entry` if it is the same host or a dotted subdomain of it.
/// Fail-closed: `evilsantoria.app` does not match `santoria.app`.
fn host_matches(entry: &str, dest: &str) -> bool {
    dest == entry || dest.ends_with(&format!(".{entry}"))
}

/// Errors loading a salvoconducto. Both surface to the user; never swallowed.
#[derive(Debug, thiserror::Error)]
pub enum CentinelaError {
    #[error("no se pudo leer el salvoconducto: {0}")]
    Io(#[from] std::io::Error),
    #[error("el salvoconducto tiene un formato inválido: {0}")]
    Parse(#[from] serde_json::Error),
}

#[cfg(test)]
mod tests {
    use super::*;

    const SALVOCONDUCTO: &str = r#"{
      "agent_id": "asistente-seguro",
      "version": "1.0",
      "scopes": {
        "read": ["email:inbox", "bank:balance", "bank:transactions"],
        "write": ["email:send"],
        "money": [],
        "egress_allowlist": ["api.santoria.app"]
      },
      "rule_of_two": { "untrusted_input": true, "sensitive_data": true, "external_action": false },
      "step_up_required_for": ["email:send", "bank:transfer"],
      "duress": { "enabled": true, "action": "lockdown_and_alert" }
    }"#;

    fn caps() -> Capabilities {
        Capabilities::from_json(SALVOCONDUCTO).expect("fixture must parse")
    }

    #[test]
    fn parses_full_salvoconducto() {
        let c = caps();
        assert_eq!(c.agent_id, "asistente-seguro");
        assert_eq!(c.version, "1.0");
        assert!(c.duress.enabled);
        assert_eq!(c.duress.action, "lockdown_and_alert");
        assert!(c.rule_of_two.untrusted_input);
    }

    #[test]
    fn declares_only_listed_capabilities() {
        let c = caps();
        assert!(c.declares("bank:balance"));
        assert!(c.declares("email:send"));
        // bank:transfer is deliberately absent: this is Demo 1's whole point.
        assert!(!c.declares("bank:transfer"));
        assert!(!c.declares("files:delete"));
    }

    #[test]
    fn step_up_membership() {
        let c = caps();
        assert!(c.requires_step_up("email:send"));
        assert!(c.requires_step_up("bank:transfer"));
        assert!(!c.requires_step_up("bank:balance"));
    }

    #[test]
    fn set_capability_revokes_and_grants() {
        let mut c = caps();
        // Revoke a declared capability: gone from every scope.
        c.set_capability("bank:balance", false);
        assert!(!c.declares("bank:balance"));
        // Grant an undeclared one: now declared (idempotent, no duplicates).
        c.set_capability("bank:transfer", true);
        c.set_capability("bank:transfer", true);
        assert!(c.declares("bank:transfer"));
        assert_eq!(
            c.scopes
                .write
                .iter()
                .filter(|x| *x == "bank:transfer")
                .count(),
            1
        );
    }

    #[test]
    fn egress_exact_and_subdomain_but_not_lookalike() {
        let c = Capabilities::from_json(
            r#"{"agent_id":"a","scopes":{"egress_allowlist":["santoria.app"]}}"#,
        )
        .unwrap();
        assert!(c.egress_allowed("santoria.app"));
        assert!(c.egress_allowed("api.santoria.app"));
        assert!(!c.egress_allowed("evilsantoria.app"));
        assert!(!c.egress_allowed("santoria.app.evil.com"));
    }

    #[test]
    fn missing_arrays_default_to_empty_and_deny() {
        let c = Capabilities::from_json(r#"{"agent_id":"bare"}"#).unwrap();
        assert!(!c.declares("anything"));
        assert!(!c.egress_allowed("anywhere"));
        assert!(!c.requires_step_up("anything"));
    }

    #[test]
    fn missing_agent_id_is_a_parse_error() {
        assert!(Capabilities::from_json(r#"{"scopes":{}}"#).is_err());
    }

    #[test]
    fn bad_json_surfaces_parse_error() {
        let err = Capabilities::from_json("{not json").unwrap_err();
        assert!(matches!(err, CentinelaError::Parse(_)));
    }
}
