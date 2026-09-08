//! Credit updates become spendable only when their control frame is written.
use crate::{wire::Outgoing, BridgeError};
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
};
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::Message;

pub(crate) struct Control {
    pub message: Message,
    pub replenish: Option<(Arc<AtomicUsize>, usize)>,
}
impl From<Message> for Control {
    fn from(message: Message) -> Self {
        Self {
            message,
            replenish: None,
        }
    }
}
pub(crate) fn enqueue(
    sender: &mpsc::Sender<Control>,
    message: Outgoing,
) -> Result<(), BridgeError> {
    let text = serde_json::to_string(&message).map_err(|_| BridgeError::Protocol)?;
    sender
        .try_send(Message::Text(text.into()).into())
        .map_err(|_| BridgeError::Protocol)
}
pub(crate) fn consume(credit: &AtomicUsize, bytes: usize) -> Result<(), BridgeError> {
    credit
        .fetch_update(Ordering::SeqCst, Ordering::SeqCst, |value| {
            value.checked_sub(bytes)
        })
        .map(|_| ())
        .map_err(|_| BridgeError::Protocol)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn upload_credit_cannot_be_spent_twice() {
        let credit = AtomicUsize::new(262144);
        for _ in 0..4 {
            consume(&credit, 65536).unwrap();
        }
        assert_eq!(consume(&credit, 1), Err(BridgeError::Protocol));
        assert_eq!(credit.load(Ordering::SeqCst), 0);
        credit.fetch_add(65536, Ordering::SeqCst);
        consume(&credit, 65536).unwrap();
    }
}
