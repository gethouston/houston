//! The human approver: turns a `STEP_UP` verdict into a WhatsApp question to the
//! verified trust anchor and waits for the owner's SI or NO. This is the plan's
//! step-up auth, made real and reachable from a phone.

use crate::approval::{ApprovalRegistry, Outcome};
use crate::enrollment::Enrollment;
use crate::whatsapp::WhatsApp;
use std::sync::Arc;
use std::time::Duration;

pub struct Approver {
    registry: Arc<ApprovalRegistry>,
    whatsapp: Arc<WhatsApp>,
    enrollment: Arc<Enrollment>,
    ttl: Duration,
}

impl Approver {
    pub fn new(whatsapp: Arc<WhatsApp>, enrollment: Arc<Enrollment>) -> Self {
        Self {
            registry: Arc::new(ApprovalRegistry::new()),
            whatsapp,
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
        if let Err(e) = self.whatsapp.send_approval(&to, agent, capability).await {
            eprintln!("[centinela] no se pudo enviar la solicitud de aprobacion: {e}");
            return Outcome::TimedOut;
        }
        let (id, rx) = self.registry.open();
        eprintln!("[centinela] aprobacion #{id} enviada por WhatsApp; esperando SI/NO");
        self.registry.wait(id, rx, self.ttl).await
    }
}
