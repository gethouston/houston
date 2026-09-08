use super::*;
use crate::flow::consume;
use base64::{engine::general_purpose::STANDARD, Engine};
use tokio_tungstenite::tungstenite::Message;
impl Requests {
    pub(super) fn upload(
        &mut self,
        id: Uuid,
        sequence: u64,
        data: String,
    ) -> Result<(), BridgeError> {
        if self.rejected.contains(&id) {
            return Ok(());
        }
        let request = self.active.get_mut(&id).ok_or(BridgeError::Protocol)?;
        if sequence != request.sequence || data.len() > CHUNK.div_ceil(3) * 4 {
            return Err(BridgeError::Protocol);
        }
        let chunk = STANDARD.decode(data).map_err(|_| BridgeError::Protocol)?;
        if chunk.is_empty() || chunk.len() > CHUNK || matches!(request.operation, Operation::Models)
        {
            return Err(BridgeError::Protocol);
        }
        consume(&request.upload_credit, chunk.len())?;
        let body = request.body.as_mut().ok_or(BridgeError::Protocol)?;
        if body.len() + chunk.len() > BODY {
            return self.fail(id, "too_large");
        }
        body.extend_from_slice(&chunk);
        request.sequence += 1;
        // Consumed into the capped validation body, never acknowledged merely on receipt.
        let update = serde_json::to_string(&Outgoing::Window {
            request_id: id,
            direction: "request",
            bytes: chunk.len(),
        })
        .map_err(|_| BridgeError::Protocol)?;
        self.control
            .try_send(Control {
                message: Message::Text(update.into()),
                replenish: Some((request.upload_credit.clone(), chunk.len())),
            })
            .map_err(|_| BridgeError::Protocol)?;
        Ok(())
    }
}
