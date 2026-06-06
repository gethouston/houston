//! The human approver: turns a `STEP_UP` verdict into a WhatsApp question to the
//! verified trust anchor and waits for the owner's SI or NO.

use crate::approval::{ApprovalRegistry, Outcome};
use crate::enrollment::Enrollment;
use crate::notifier::Notifier;
use std::sync::Arc;
use std::time::Duration;

pub struct Approver {
    registry: Arc<ApprovalRegistry>,
    notifier: Arc<dyn Notifier>,
    enrollment: Arc<Enrollment>,
    ttl: Duration,
}

impl Approver {
    pub fn new(notifier: Arc<dyn Notifier>, enrollment: Arc<Enrollment>) -> Self {
        Self {
            registry: Arc::new(ApprovalRegistry::new()),
            notifier,
            enrollment,
            ttl: Duration::from_secs(120),
        }
    }

    /// Build an approver that resolves replies against an existing shared
    /// registry: the one the webhook already listens on. This lets a request
    /// triggered over HTTP be answered by the same SI/NO reply flow.
    pub fn with_registry(
        registry: Arc<ApprovalRegistry>,
        notifier: Arc<dyn Notifier>,
        enrollment: Arc<Enrollment>,
    ) -> Self {
        Self {
            registry,
            notifier,
            enrollment,
            ttl: Duration::from_secs(120),
        }
    }

    /// The shared registry the webhook resolves incoming replies against.
    pub fn registry(&self) -> Arc<ApprovalRegistry> {
        Arc::clone(&self.registry)
    }

    /// Ask the verified owner to approve `capability` for `agent`. Blocks until
    /// SI, NO, or timeout. Fail-closed twice over: no verified number means no
    /// channel, and a send failure means no approval.
    pub async fn request(&self, agent: &str, capability: &str) -> Outcome {
        let Some(to) = self.enrollment.verified() else {
            eprintln!("[centinela] no hay numero verificado; el step-up se bloquea (fail-closed)");
            return Outcome::TimedOut;
        };
        if let Err(e) = self.notifier.send_approval(&to, agent, capability).await {
            eprintln!("[centinela] no se pudo enviar la solicitud de aprobacion: {e}");
            return Outcome::TimedOut;
        }
        let (id, rx) = self.registry.open();
        eprintln!("[centinela] aprobacion #{id} enviada por WhatsApp; esperando SI/NO");
        self.registry.wait(id, rx, self.ttl).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notifier::mock::MockNotifier;

    fn approver(mock: Arc<MockNotifier>, verified: Option<&str>) -> Approver {
        Approver::new(
            mock,
            Arc::new(Enrollment::new(verified.map(str::to_string))),
        )
    }

    /// Resolve the (single) pending approval with `answer` once it appears.
    fn resolve_when_ready(registry: Arc<ApprovalRegistry>, answer: bool) {
        tokio::spawn(async move {
            loop {
                if registry.resolve_latest(answer).is_some() {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(5)).await;
            }
        });
    }

    #[tokio::test]
    async fn with_registry_shares_the_passed_registry() {
        let registry = Arc::new(ApprovalRegistry::new());
        let ap = Approver::with_registry(
            registry.clone(),
            Arc::new(MockNotifier::new()),
            Arc::new(Enrollment::new(Some("573058166527".into()))),
        );
        // The HTTP-triggered demo request and the webhook reply must hit the same
        // registry, so an SI/NO answer resolves the pending approval.
        assert!(Arc::ptr_eq(&ap.registry(), &registry));
    }

    #[tokio::test]
    async fn yes_approves_and_sends_one_request() {
        let mock = Arc::new(MockNotifier::new());
        let ap = approver(mock.clone(), Some("573058166527"));
        resolve_when_ready(ap.registry(), true);
        assert_eq!(
            ap.request("asistente-seguro", "email:send").await,
            Outcome::Approved
        );
        assert_eq!(mock.approval_count(), 1);
    }

    #[tokio::test]
    async fn no_denies() {
        let mock = Arc::new(MockNotifier::new());
        let ap = approver(mock.clone(), Some("573058166527"));
        resolve_when_ready(ap.registry(), false);
        assert_eq!(ap.request("a", "email:send").await, Outcome::Denied);
    }

    #[tokio::test]
    async fn no_verified_number_is_fail_closed() {
        let mock = Arc::new(MockNotifier::new());
        let ap = approver(mock.clone(), None);
        assert_eq!(ap.request("a", "email:send").await, Outcome::TimedOut);
        assert_eq!(mock.approval_count(), 0); // nothing sent
    }

    #[tokio::test]
    async fn send_failure_is_fail_closed() {
        let ap = approver(Arc::new(MockNotifier::failing()), Some("573058166527"));
        assert_eq!(ap.request("a", "email:send").await, Outcome::TimedOut);
    }
}
