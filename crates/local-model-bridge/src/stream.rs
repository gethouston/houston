use crate::{target::Target, wire::*, BridgeError};
use base64::{engine::general_purpose::STANDARD, Engine};
use futures_util::StreamExt;
use std::{
    sync::{
        atomic::{AtomicBool, AtomicUsize},
        Arc,
    },
    time::Duration,
};
use tokio::sync::{mpsc, oneshot, Semaphore};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

pub(crate) struct Outbox {
    pub sender: mpsc::Sender<Packet>,
    pub cancel: CancellationToken,
    pub terminal: Arc<AtomicBool>,
    pub outstanding: Arc<AtomicUsize>,
}
pub(crate) struct Packet {
    pub cancel: CancellationToken,
    pub terminal: Option<Arc<AtomicBool>>,
    pub outstanding: Arc<AtomicUsize>,
    pub message: Outgoing,
    pub sent: oneshot::Sender<()>,
}
pub(crate) async fn emit(outbox: &Outbox, message: Outgoing) -> Result<(), BridgeError> {
    let (sent, ack) = oneshot::channel();
    tokio::time::timeout(Duration::from_secs(60), async {
        let terminal = if matches!(message, Outgoing::ResponseEnd { .. }) {
            Some(outbox.terminal.clone())
        } else {
            None
        };
        outbox
            .sender
            .send(Packet {
                message,
                sent,
                cancel: outbox.cancel.clone(),
                terminal,
                outstanding: outbox.outstanding.clone(),
            })
            .await
            .map_err(|_| BridgeError::Closed)?;
        ack.await.map_err(|_| BridgeError::Closed)
    })
    .await
    .map_err(|_| BridgeError::Timeout)?
}
pub(crate) async fn forward(
    target: Arc<Target>,
    id: Uuid,
    operation: Operation,
    body: Vec<u8>,
    credits: Arc<Semaphore>,
    sender: Outbox,
) -> Result<(), &'static str> {
    if matches!(operation, Operation::Chat) {
        crate::validation::chat_model(&body, &target.model)?;
    }
    let path = match operation {
        Operation::Models => "models",
        Operation::Chat => "chat/completions",
    };
    let url = format!("{}/{path}", target.prefix);
    let mut request = match operation {
        Operation::Models => target.client.get(url),
        Operation::Chat => target
            .client
            .post(url)
            .header("Content-Type", "application/json")
            .body(body),
    };
    if let Some(key) = &target.key {
        request = request.bearer_auth(key);
    }
    let response = tokio::time::timeout(Duration::from_secs(300), request.send())
        .await
        .map_err(|_| "timeout")?
        .map_err(|_| "model_unavailable")?;
    if response.status().is_redirection() {
        return Err("upstream_failed");
    }
    if matches!(operation, Operation::Models) {
        let body = crate::models::selected(response, &target.model).await?;
        emit(
            &sender,
            Outgoing::ResponseStart {
                request_id: id,
                status: 200,
                content_type: Some("application/json".into()),
            },
        )
        .await
        .map_err(|_| "upstream_failed")?;
        for (sequence, chunk) in body.chunks(CHUNK).enumerate() {
            let permit = tokio::time::timeout(
                Duration::from_secs(60),
                credits.acquire_many(chunk.len() as u32),
            )
            .await
            .map_err(|_| "timeout")?
            .map_err(|_| "cancelled")?;
            permit.forget();
            emit(
                &sender,
                Outgoing::ResponseChunk {
                    request_id: id,
                    sequence: sequence as u64,
                    data: STANDARD.encode(chunk),
                },
            )
            .await
            .map_err(|_| "upstream_failed")?;
        }
        return emit(&sender, Outgoing::ResponseEnd { request_id: id })
            .await
            .map_err(|_| "upstream_failed");
    }
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .filter(|v| v.len() <= 256)
        .map(str::to_owned);
    emit(
        &sender,
        Outgoing::ResponseStart {
            request_id: id,
            status: response.status().as_u16(),
            content_type,
        },
    )
    .await
    .map_err(|_| "upstream_failed")?;
    let mut source = response.bytes_stream();
    let mut sequence = 0;
    while let Some(result) = tokio::time::timeout(Duration::from_secs(300), source.next())
        .await
        .map_err(|_| "timeout")?
    {
        let bytes = result.map_err(|_| "upstream_failed")?;
        for chunk in bytes.chunks(CHUNK) {
            let permit = tokio::time::timeout(
                Duration::from_secs(60),
                credits.acquire_many(chunk.len() as u32),
            )
            .await
            .map_err(|_| "timeout")?
            .map_err(|_| "cancelled")?;
            permit.forget();
            emit(
                &sender,
                Outgoing::ResponseChunk {
                    request_id: id,
                    sequence,
                    data: STANDARD.encode(chunk),
                },
            )
            .await
            .map_err(|_| "upstream_failed")?;
            sequence += 1;
        }
    }
    emit(&sender, Outgoing::ResponseEnd { request_id: id })
        .await
        .map_err(|_| "upstream_failed")
}
