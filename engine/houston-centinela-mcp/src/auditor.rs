//! The Auditor: the security choke point's watchdog. Every tool call already
//! passes through the gate; the Auditor reviews each verdict and, when it sees a
//! real bypass attempt (a jailbreak for an undeclared capability, the duress
//! latch, or an exfiltration via taint/egress), it alerts the verified owner out
//! of band over WhatsApp.
//!
//! Step-ups are not bypasses (they go through the approval flow), and allows are
//! normal. So only the structural DENYs raise an alert. The alert is best-effort
//! and never blocks the gate; the call was already denied.

use crate::enrollment::Enrollment;
use crate::notifier::Notifier;
use houston_centinela::{Decision, Reason};
use std::sync::Arc;

pub struct Auditor {
    notifier: Arc<dyn Notifier>,
    enrollment: Arc<Enrollment>,
}

impl Auditor {
    pub fn new(notifier: Arc<dyn Notifier>, enrollment: Arc<Enrollment>) -> Self {
        Self {
            notifier,
            enrollment,
        }
    }

    /// Review one verdict. If it is a security bypass attempt, alert the verified
    /// owner. No-op for allows, step-ups, and benign denies.
    pub async fn audit(&self, agent: &str, capability: &str, decision: &Decision) {
        let Some(reason) = bypass_reason(decision) else {
            return;
        };
        let Some(to) = self.enrollment.verified() else {
            eprintln!(
                "[centinela:auditor] bypass bloqueado ({capability}) pero no hay numero verificado para alertar"
            );
            return;
        };
        match self
            .notifier
            .send_alert(&to, agent, capability, &reason)
            .await
        {
            Ok(()) => eprintln!(
                "[centinela:auditor] alerta de seguridad enviada al titular ({capability})"
            ),
            Err(e) => eprintln!("[centinela:auditor] no se pudo enviar la alerta: {e}"),
        }
    }
}

/// The human reason string if `decision` is a security bypass attempt worth an
/// alert, else `None`. A missing egress destination is a malformed call, not an
/// attack, so it does not alert.
fn bypass_reason(decision: &Decision) -> Option<String> {
    match decision {
        Decision::Deny { reason } => match reason {
            Reason::DuressActive
            | Reason::CapabilityNotDeclared(_)
            | Reason::TaintedToSensitiveSink
            | Reason::EgressNotAllowed(_) => Some(reason.to_string()),
            // Malformed call, or reasons the gate only ever raises as STEP_UP:
            // not a bypass, so no alert.
            Reason::EgressMissingDest | Reason::RuleOfTwoExceeded | Reason::StepUpRequired(_) => {
                None
            }
        },
        Decision::Allow | Decision::StepUp { .. } => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notifier::mock::MockNotifier;

    fn auditor(mock: Arc<MockNotifier>, verified: Option<&str>) -> Auditor {
        Auditor::new(
            mock,
            Arc::new(Enrollment::new(verified.map(str::to_string))),
        )
    }

    #[tokio::test]
    async fn alerts_on_jailbreak_undeclared_capability() {
        let mock = Arc::new(MockNotifier::new());
        auditor(mock.clone(), Some("573058166527"))
            .audit(
                "asistente-seguro",
                "bank:transfer",
                &Decision::deny(Reason::CapabilityNotDeclared("bank:transfer".into())),
            )
            .await;
        let alerts = mock.alerts.lock().unwrap();
        assert_eq!(alerts.len(), 1);
        assert_eq!(alerts[0].0, "573058166527");
        assert_eq!(alerts[0].2, "bank:transfer");
    }

    #[tokio::test]
    async fn alerts_on_duress_taint_and_egress() {
        for reason in [
            Reason::DuressActive,
            Reason::TaintedToSensitiveSink,
            Reason::EgressNotAllowed("evil.example".into()),
        ] {
            let mock = Arc::new(MockNotifier::new());
            auditor(mock.clone(), Some("573058166527"))
                .audit("a", "email:send", &Decision::deny(reason))
                .await;
            assert_eq!(mock.alert_count(), 1);
        }
    }

    #[tokio::test]
    async fn does_not_alert_on_allow_or_step_up() {
        let mock = Arc::new(MockNotifier::new());
        let aud = auditor(mock.clone(), Some("573058166527"));
        aud.audit("a", "bank:balance", &Decision::Allow).await;
        aud.audit(
            "a",
            "email:send",
            &Decision::step_up(Reason::StepUpRequired("email:send".into())),
        )
        .await;
        assert_eq!(mock.alert_count(), 0);
    }

    #[tokio::test]
    async fn does_not_alert_on_malformed_egress() {
        let mock = Arc::new(MockNotifier::new());
        auditor(mock.clone(), Some("573058166527"))
            .audit(
                "a",
                "email:send",
                &Decision::deny(Reason::EgressMissingDest),
            )
            .await;
        assert_eq!(mock.alert_count(), 0);
    }

    #[tokio::test]
    async fn no_alert_when_no_verified_number() {
        let mock = Arc::new(MockNotifier::new());
        auditor(mock.clone(), None)
            .audit(
                "a",
                "bank:transfer",
                &Decision::deny(Reason::CapabilityNotDeclared("bank:transfer".into())),
            )
            .await;
        assert_eq!(mock.alert_count(), 0);
    }
}
