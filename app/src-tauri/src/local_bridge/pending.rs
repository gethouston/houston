//! Pending dials must be cancellable before waiting for the lifecycle lock.
use super::types::Identity;
use std::sync::Mutex;
use tokio_util::sync::CancellationToken;
static PENDING: Mutex<Option<Pending>> = Mutex::new(None);
struct Pending {
    id: uuid::Uuid,
    identity: Identity,
    cancel: CancellationToken,
}
pub struct DialGuard {
    id: uuid::Uuid,
    pub cancel: CancellationToken,
}
impl DialGuard {
    pub fn begin(identity: &Identity) -> Result<Self, String> {
        let mut slot = PENDING
            .lock()
            .map_err(|_| "Bridge dial state unavailable")?;
        if let Some(previous) = slot.take() {
            previous.cancel.cancel();
        }
        let id = uuid::Uuid::new_v4();
        let cancel = CancellationToken::new();
        *slot = Some(Pending {
            id,
            identity: identity.clone(),
            cancel: cancel.clone(),
        });
        Ok(Self { id, cancel })
    }
}
impl Drop for DialGuard {
    fn drop(&mut self) {
        self.cancel.cancel();
        match PENDING.lock() {
            Ok(mut slot) => {
                if slot.as_ref().is_some_and(|pending| pending.id == self.id) {
                    slot.take();
                }
            }
            Err(_) => tracing::error!("Bridge dial cleanup state unavailable"),
        }
    }
}
pub fn cancel(identity: &Identity) -> Result<(), String> {
    let slot = PENDING
        .lock()
        .map_err(|_| "Bridge dial state unavailable")?;
    if let Some(pending) = slot
        .as_ref()
        .filter(|pending| &pending.identity == identity)
    {
        pending.cancel.cancel();
    }
    Ok(())
}
pub fn cancel_all() {
    match PENDING.lock() {
        Ok(slot) => {
            if let Some(pending) = slot.as_ref() {
                pending.cancel.cancel();
            }
        }
        Err(_) => tracing::error!("Bridge exit dial state unavailable"),
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn pending_dial_cancels_before_locked_lifecycle_can_finish() {
        let identity = Identity {
            environment: "https://example.test".into(),
            user_id: "user".into(),
            org_id: "org".into(),
            agent_id: "agent".into(),
        };
        let dial = DialGuard::begin(&identity).unwrap();
        let held = super::super::BRIDGE_OP.lock().await;
        cancel(&identity).unwrap();
        tokio::time::timeout(
            std::time::Duration::from_millis(100),
            dial.cancel.cancelled(),
        )
        .await
        .unwrap();
        drop(held);
        // Exercise the same cancellation guard while a real WS handshake is hanging.
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = format!("ws://{}/bridge", listener.local_addr().unwrap());
        let (accepted, ready) = tokio::sync::oneshot::channel();
        let server = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut request = Vec::new();
            while !request.ends_with(b"\r\n\r\n") {
                let mut byte = [0u8];
                stream.read_exact(&mut byte).await.unwrap();
                request.push(byte[0]);
            }
            accepted.send(()).unwrap();
            let mut byte = [0u8];
            assert_eq!(stream.read(&mut byte).await.unwrap(), 0);
            stream.shutdown().await.unwrap();
        });
        let pending = DialGuard::begin(&identity).unwrap();
        let connection = tokio::spawn(async move {
            tokio::select! {
                biased;
                _ = pending.cancel.cancelled() => true,
                _ = houston_local_model_bridge::connect(houston_local_model_bridge::BridgeConfig {
                    connect_url:address,ticket:"test-ticket".into(),target_base_url:"http://127.0.0.1:1/v1".into(),model:"selected".into(),local_api_key:None
                }, |_| {}) => false,
            }
        });
        ready.await.unwrap();
        cancel(&identity).unwrap();
        assert!(
            tokio::time::timeout(std::time::Duration::from_secs(2), connection)
                .await
                .unwrap()
                .unwrap()
        );
        tokio::time::timeout(std::time::Duration::from_secs(2), server)
            .await
            .unwrap()
            .unwrap();
    }
}
