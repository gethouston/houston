//! The verdict the capability gate returns for a single tool call.
//!
//! [`Decision`] is the public output of [`crate::evaluate`]. Reasons are a
//! typed [`Reason`] enum, never free strings, so callers can branch on the
//! stable machine [`Reason::code`] while still rendering a human `Display`
//! message in the decision log the user sees.

use serde::Serialize;
use std::fmt;

/// What the gate decided for one tool call.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "decision", rename_all = "snake_case")]
pub enum Decision {
    /// The call cleared every gate and may run.
    Allow,
    /// The call is forbidden. Nothing runs.
    Deny { reason: Reason },
    /// The call needs explicit human validation (passkey / 2FA) before it runs.
    StepUp { reason: Reason },
}

impl Decision {
    pub fn deny(reason: Reason) -> Self {
        Decision::Deny { reason }
    }

    pub fn step_up(reason: Reason) -> Self {
        Decision::StepUp { reason }
    }

    pub fn is_allow(&self) -> bool {
        matches!(self, Decision::Allow)
    }

    pub fn is_deny(&self) -> bool {
        matches!(self, Decision::Deny { .. })
    }

    pub fn is_step_up(&self) -> bool {
        matches!(self, Decision::StepUp { .. })
    }

    /// The reason behind a non-allow verdict, if any.
    pub fn reason(&self) -> Option<&Reason> {
        match self {
            Decision::Allow => None,
            Decision::Deny { reason } | Decision::StepUp { reason } => Some(reason),
        }
    }
}

impl fmt::Display for Decision {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Decision::Allow => write!(f, "ALLOW"),
            Decision::Deny { reason } => write!(f, "DENY: {reason}"),
            Decision::StepUp { reason } => write!(f, "STEP_UP: {reason}"),
        }
    }
}

/// Why the gate denied or stepped up. `Display` is the human message; `code`
/// is the stable identifier for logs, metrics and the UI.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "code", content = "detail", rename_all = "snake_case")]
pub enum Reason {
    /// Duress latch is armed: the session is in read-only lockdown.
    DuressActive,
    /// The capability was never declared in this agent's salvoconducto.
    CapabilityNotDeclared(String),
    /// An untrusted-tainted input is heading to a sensitive or egress sink.
    TaintedToSensitiveSink,
    /// Egress to a destination that is not on the allowlist.
    EgressNotAllowed(String),
    /// An egress call that declares no destination at all.
    EgressMissingDest,
    /// The session would combine all three Rule-of-Two properties at once.
    RuleOfTwoExceeded,
    /// The capability is irreversible and requires a passkey / 2FA.
    StepUpRequired(String),
}

impl Reason {
    /// Stable machine identifier, safe to key logs and metrics on.
    pub fn code(&self) -> &'static str {
        match self {
            Reason::DuressActive => "duress_active",
            Reason::CapabilityNotDeclared(_) => "capability_not_declared",
            Reason::TaintedToSensitiveSink => "tainted_to_sensitive_sink",
            Reason::EgressNotAllowed(_) => "egress_not_allowed",
            Reason::EgressMissingDest => "egress_missing_dest",
            Reason::RuleOfTwoExceeded => "rule_of_two_exceeded",
            Reason::StepUpRequired(_) => "step_up_required",
        }
    }
}

impl fmt::Display for Reason {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Reason::DuressActive => write!(
                f,
                "modo de coacción activo: las capacidades sensibles quedan bloqueadas"
            ),
            Reason::CapabilityNotDeclared(cap) => write!(
                f,
                "'{cap}' no está declarada en el salvoconducto de este agente"
            ),
            Reason::TaintedToSensitiveSink => write!(
                f,
                "un dato de fuente no confiable intenta llegar a un destino sensible o de salida"
            ),
            Reason::EgressNotAllowed(dest) => {
                write!(f, "el destino '{dest}' no está en la lista de salidas permitidas")
            }
            Reason::EgressMissingDest => write!(f, "la salida no declara un destino"),
            Reason::RuleOfTwoExceeded => write!(
                f,
                "la sesión combina las tres propiedades de riesgo a la vez: requiere validación humana"
            ),
            Reason::StepUpRequired(cap) => {
                write!(f, "'{cap}' requiere confirmación con passkey o 2FA")
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn predicates_and_reason_accessor() {
        assert!(Decision::Allow.is_allow());
        assert!(Decision::deny(Reason::DuressActive).is_deny());
        assert!(Decision::step_up(Reason::RuleOfTwoExceeded).is_step_up());
        assert_eq!(Decision::Allow.reason(), None);
        assert_eq!(
            Decision::deny(Reason::EgressMissingDest).reason(),
            Some(&Reason::EgressMissingDest)
        );
    }

    #[test]
    fn codes_are_stable() {
        assert_eq!(Reason::DuressActive.code(), "duress_active");
        assert_eq!(
            Reason::CapabilityNotDeclared("bank:transfer".into()).code(),
            "capability_not_declared"
        );
        assert_eq!(Reason::RuleOfTwoExceeded.code(), "rule_of_two_exceeded");
    }

    #[test]
    fn display_is_human_and_has_no_em_dash() {
        let msg = Decision::deny(Reason::CapabilityNotDeclared("bank:transfer".into())).to_string();
        assert!(msg.starts_with("DENY: "));
        assert!(msg.contains("bank:transfer"));
        // Product copy rule: never an em dash in user-facing strings.
        assert!(!msg.contains('—'));
    }

    #[test]
    fn serialises_with_decision_and_code() {
        let json = serde_json::to_value(Decision::deny(Reason::EgressNotAllowed(
            "evil.example".into(),
        )))
        .unwrap();
        assert_eq!(json["decision"], "deny");
        assert_eq!(json["reason"]["code"], "egress_not_allowed");
        assert_eq!(json["reason"]["detail"], "evil.example");
    }
}
