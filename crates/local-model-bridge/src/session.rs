use crate::{
    flow::{enqueue, Control},
    stream::Packet,
    target::Target,
    wire::*,
    BridgeError, BridgeStatus,
};
use futures_util::{SinkExt, StreamExt};
use std::{sync::Arc, time::Duration};
use tokio::{net::TcpStream, sync::mpsc, task::JoinSet, time::Instant};
use tokio_tungstenite::{tungstenite::Message, MaybeTlsStream, WebSocketStream};
use tokio_util::sync::CancellationToken;
mod requests;

pub(crate) fn decode(message: Message) -> Result<Incoming, BridgeError> {
    let Message::Text(text) = message else {
        return Err(BridgeError::Protocol);
    };
    if text.len() > MESSAGE {
        return Err(BridgeError::Protocol);
    }
    let parsed: Incoming = serde_json::from_str(&text).map_err(|_| BridgeError::Protocol)?;
    if !matches!(parsed, Incoming::RequestChunk { .. }) && text.len() > 16384 {
        return Err(BridgeError::Protocol);
    }
    Ok(parsed)
}
pub(crate) fn expiry(value: &str) -> Result<Instant, BridgeError> {
    let date = chrono::DateTime::parse_from_rfc3339(value).map_err(|_| BridgeError::Protocol)?;
    let remaining = (date.with_timezone(&chrono::Utc) - chrono::Utc::now())
        .to_std()
        .map_err(|_| BridgeError::Expired)?;
    if remaining > Duration::from_secs(660) {
        return Err(BridgeError::Protocol);
    }
    Ok(Instant::now() + remaining)
}
/// When to ask the host for a renewal: two minutes before expiry, never in the
/// past. Two minutes leaves room for the ticket round trip through the gateway
/// even when the webview only wakes on our event.
fn renewal_due(expires: Instant) -> Instant {
    let now = Instant::now();
    expires
        .checked_sub(Duration::from_secs(120))
        .map_or(now, |due| due.max(now))
}
pub(crate) async fn run(
    socket: WebSocketStream<MaybeTlsStream<TcpStream>>,
    target: Arc<Target>,
    cancel: CancellationToken,
    mut commands: mpsc::Receiver<crate::Renewal>,
    callback: Arc<dyn Fn(BridgeStatus) + Send + Sync>,
    mut expires: Instant,
    mut expires_at: String,
) -> Result<(), BridgeError> {
    let (mut sink, mut source) = socket.split();
    let (control, mut controls) = mpsc::channel::<Control>(64);
    let (data, mut packets) = mpsc::channel::<Packet>(4);
    let mut tasks = JoinSet::new();
    tasks.spawn(async move {
        loop {
            let (message, ack, replenish) = tokio::select! {
                biased;
                Some(control) = controls.recv() => (control.message, None, control.replenish),
                Some(packet) = packets.recv() => {
                    if packet.cancel.is_cancelled() { continue; }
                    if let Some(terminal) = &packet.terminal { terminal.store(true, std::sync::atomic::Ordering::SeqCst); }
                    if let Outgoing::ResponseChunk { data, .. } = &packet.message {
                        // Base64 padding determines raw bytes without decoding or another allocation.
                        let padding = data.bytes().rev().take_while(|byte| *byte == b'=').count();
                        packet.outstanding.fetch_add(data.len() / 4 * 3 - padding, std::sync::atomic::Ordering::SeqCst);
                    }
                    let encoded = serde_json::to_string(&packet.message).map_err(|_| BridgeError::Protocol)?;
                    (Message::Text(encoded.into()), Some(packet.sent), None)
                }
                else => return Ok(None),
            };
            tokio::time::timeout(Duration::from_secs(60), sink.send(message)).await
                .map_err(|_| BridgeError::Timeout)?.map_err(|_| BridgeError::Connection)?;
            if let Some((credit, bytes)) = replenish { credit.fetch_add(bytes, std::sync::atomic::Ordering::SeqCst); }
            if let Some(ack) = ack { if ack.send(()).is_err() { continue; } }
        }
    });
    let mut requests = requests::Requests::new(target, data, control.clone());
    let mut heartbeat = tokio::time::interval(Duration::from_secs(15));
    let mut last_pong = Instant::now();
    let mut renewal_pending = None;
    let mut renew_at = Some(renewal_due(expires));
    let result = async {
        loop {
            tokio::select! {
                biased;
                _ = cancel.cancelled() => return Ok(()),
                _ = tokio::time::sleep_until(expires) => return Err(BridgeError::Expired),
                _ = tokio::time::sleep_until(renew_at.unwrap_or(expires)), if renew_at.is_some() => {
                    renew_at = None;
                    callback(BridgeStatus::RenewalDue { session_expires_at: expires_at.clone() });
                }
                Some(renewal) = commands.recv() => {
                    if renewal_pending.is_some() { return Err(BridgeError::Protocol); }
                    enqueue(&control, Outgoing::Renew { ticket: renewal.ticket })?;
                    renewal_pending = Some(renewal.reply);
                }
                _ = heartbeat.tick() => {
                    if last_pong.elapsed() > Duration::from_secs(45) { return Err(BridgeError::Timeout); }
                    requests.expire()?;
                    control.try_send(Message::Ping(Vec::new().into()).into()).map_err(|_| BridgeError::Connection)?;
                }
                Some(completed) = tasks.join_next() => {
                    match completed.map_err(|_| BridgeError::Closed)?? {
                        Some(id) => requests.finished(id),
                        None => return Err(BridgeError::Closed),
                    }
                }
                message = source.next() => {
                    let message = message.ok_or(BridgeError::Closed)?.map_err(|_| BridgeError::Connection)?;
                    match message {
                        Message::Pong(_) => { last_pong = Instant::now(); continue; }
                        Message::Ping(bytes) => {
                            control.try_send(Message::Pong(bytes).into()).map_err(|_| BridgeError::Connection)?;
                            continue;
                        }
                        Message::Close(_) => return Err(BridgeError::Closed),
                        _ => {}
                    }
                    match decode(message)? {
                        Incoming::Renewed { session_expires_at } => {
                            if renewal_pending.is_none() { return Err(BridgeError::Protocol); }
                            let next = expiry(&session_expires_at)?;
                            if next <= expires { return Err(BridgeError::Protocol); }
                            expires = next;
                            expires_at = session_expires_at.clone();
                            renew_at = Some(renewal_due(next));
                            let reply = renewal_pending.take().ok_or(BridgeError::Protocol)?;
                            reply.send(Ok(())).map_err(|_| BridgeError::Closed)?;
                            callback(BridgeStatus::Renewed { session_expires_at });
                        }
                        Incoming::Drain => { requests.drain(); callback(BridgeStatus::Draining); }
                        Incoming::Ready { .. } => return Err(BridgeError::Protocol),
                        incoming => requests.accept(incoming, &mut tasks, callback.clone())?,
                    }
                }
            }
        }
    }.await;
    requests.cancel_all();
    tasks.abort_all();
    while tasks.join_next().await.is_some() {}
    callback(BridgeStatus::Offline {
        error: result.clone().err(),
    });
    result
}
