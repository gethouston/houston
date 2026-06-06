//! The human approver: turns a `STEP_UP` verdict into a WhatsApp question and
//! waits for the owner's SI or NO. This is the plan's step-up auth, made real
//! and reachable from a phone.

use crate::approval::{ApprovalRegistry, Outcome};
use crate::whatsapp::WhatsApp;
use std::sync::Arc;
use std::time::Duration;

pub struct Approver {
    registry: Arc<ApprovalRegistry>,
    whatsapp: WhatsApp,
    ttl: Duration,
}

impl Approver {
    pub fn new(whatsapp: WhatsApp) -> Self {
        Self {
            registry: Arc::new(ApprovalRegistry::new()),
            whatsapp,
            ttl: Duration::from_secs(120),
        }
    }

    /// The shared registry the webhook resolves incoming replies against.
    pub fn registry(&self) -> Arc<ApprovalRegistry> {
        Arc::clone(&self.registry)
    }

    /// Ask the owner to approve `capability` for `agent`. Sends the WhatsApp and
    /// blocks until SI, NO, or timeout. A send failure is fail-closed: with no
    /// channel to a human, there is no approval.
    pub async fn request(&self, agent: &str, capability: &str) -> Outcome {
        if let Err(e) = self.whatsapp.send_approval(agent, capability).await {
            eprintln!("[centinela] no se pudo enviar la solicitud de aprobacion: {e}");
            return Outcome::TimedOut;
        }
        let (id, rx) = self.registry.open();
        eprintln!("[centinela] aprobacion #{id} enviada por WhatsApp; esperando SI/NO");
        self.registry.wait(id, rx, self.ttl).await
    }
}
