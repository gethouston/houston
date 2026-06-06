//! The outbound channel Centinela reaches a human through. The WhatsApp client
//! implements it; tests inject a mock so the whole approval, enrollment and
//! audit flow can be exercised without touching the network.

use async_trait::async_trait;

#[async_trait]
pub trait Notifier: Send + Sync {
    /// Ask the owner to approve `capability` for `agent`.
    async fn send_approval(&self, to: &str, agent: &str, capability: &str) -> Result<(), String>;
    /// Send the one-time enrollment code to a number being verified.
    async fn send_otp(&self, to: &str, code: &str) -> Result<(), String>;
    /// Alert the owner that a security bypass attempt was blocked.
    async fn send_alert(
        &self,
        to: &str,
        agent: &str,
        capability: &str,
        reason: &str,
    ) -> Result<(), String>;
}

#[cfg(test)]
pub mod mock {
    use super::*;
    use std::sync::Mutex;

    /// Records every outbound message instead of sending it. `failing()` makes
    /// every send return an error, to exercise the fail-closed paths.
    #[derive(Default)]
    pub struct MockNotifier {
        pub approvals: Mutex<Vec<(String, String, String)>>,
        pub otps: Mutex<Vec<(String, String)>>,
        pub alerts: Mutex<Vec<(String, String, String, String)>>,
        fail: bool,
    }

    impl MockNotifier {
        pub fn new() -> Self {
            Self::default()
        }
        pub fn failing() -> Self {
            Self {
                fail: true,
                ..Default::default()
            }
        }
        pub fn alert_count(&self) -> usize {
            self.alerts.lock().unwrap().len()
        }
        pub fn approval_count(&self) -> usize {
            self.approvals.lock().unwrap().len()
        }
        pub fn otp_count(&self) -> usize {
            self.otps.lock().unwrap().len()
        }
    }

    #[async_trait]
    impl Notifier for MockNotifier {
        async fn send_approval(&self, to: &str, agent: &str, cap: &str) -> Result<(), String> {
            if self.fail {
                return Err("mock notifier: envio forzado a fallar".into());
            }
            self.approvals
                .lock()
                .unwrap()
                .push((to.into(), agent.into(), cap.into()));
            Ok(())
        }
        async fn send_otp(&self, to: &str, code: &str) -> Result<(), String> {
            if self.fail {
                return Err("mock notifier: envio forzado a fallar".into());
            }
            self.otps.lock().unwrap().push((to.into(), code.into()));
            Ok(())
        }
        async fn send_alert(
            &self,
            to: &str,
            agent: &str,
            cap: &str,
            reason: &str,
        ) -> Result<(), String> {
            if self.fail {
                return Err("mock notifier: envio forzado a fallar".into());
            }
            self.alerts
                .lock()
                .unwrap()
                .push((to.into(), agent.into(), cap.into(), reason.into()));
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::mock::MockNotifier;
    use super::Notifier;

    #[tokio::test]
    async fn mock_records_each_kind_of_message() {
        let m = MockNotifier::new();
        m.send_approval("57300", "agent", "email:send")
            .await
            .unwrap();
        m.send_otp("57300", "123456").await.unwrap();
        m.send_alert("57300", "agent", "bank:transfer", "no declarada")
            .await
            .unwrap();
        assert_eq!(m.approval_count(), 1);
        assert_eq!(m.otp_count(), 1);
        assert_eq!(m.alert_count(), 1);
    }

    #[tokio::test]
    async fn failing_mock_errors_on_every_send() {
        let m = MockNotifier::failing();
        assert!(m.send_otp("57300", "1").await.is_err());
        assert!(m.send_approval("57300", "a", "c").await.is_err());
        assert!(m.send_alert("57300", "a", "c", "r").await.is_err());
    }
}
