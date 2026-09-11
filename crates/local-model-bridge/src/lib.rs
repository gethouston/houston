//! Restricted outbound transport for an explicitly selected local model.
mod flow;
mod models;
mod session;
mod stream;
mod target;
mod types;
pub use types::{BridgeConfig, BridgeError, BridgeStatus};
mod validation;
mod wire;

use futures_util::StreamExt;
use std::{sync::Arc, time::Duration};
use tokio::{
    sync::{mpsc, oneshot},
    task::JoinHandle,
};
use tokio_tungstenite::tungstenite::{client::IntoClientRequest, protocol::WebSocketConfig};
use tokio_util::sync::CancellationToken;

pub(crate) struct Renewal {
    ticket: String,
    reply: oneshot::Sender<Result<(), BridgeError>>,
}
pub struct BridgeHandle {
    cancel: CancellationToken,
    commands: mpsc::Sender<Renewal>,
    task: Option<JoinHandle<Result<(), BridgeError>>>,
}
impl BridgeHandle {
    pub async fn renew(&self, ticket: String) -> Result<(), BridgeError> {
        validate_ticket(&ticket)?;
        let (reply, receive) = oneshot::channel();
        self.commands
            .try_send(Renewal { ticket, reply })
            .map_err(|_| BridgeError::Closed)?;
        tokio::select! {
            _ = self.cancel.cancelled() => Err(BridgeError::Closed),
            result = tokio::time::timeout(Duration::from_secs(10), receive) => {
                result.map_err(|_| BridgeError::Timeout)?.map_err(|_| BridgeError::Closed)?
            }
        }
    }
    pub async fn shutdown(&mut self) -> Result<(), BridgeError> {
        self.cancel.cancel();
        if let Some(task) = self.task.take() {
            // Transport failures already reached Offline. Shutdown succeeds once
            // every socket/task is released, including a previously closed session.
            match task.await {
                Ok(_) => {}
                Err(_) => return Err(BridgeError::Closed),
            }
        }
        Ok(())
    }
}
impl Drop for BridgeHandle {
    fn drop(&mut self) {
        self.cancel.cancel();
    }
}
fn validate_ticket(ticket: &str) -> Result<(), BridgeError> {
    if ticket.is_empty() || ticket.len() > 8192 || !ticket.bytes().all(|b| b.is_ascii_graphic()) {
        return Err(BridgeError::InvalidConfig);
    }
    Ok(())
}
pub async fn connect(
    config: BridgeConfig,
    status_callback: impl Fn(BridgeStatus) + Send + Sync + 'static,
) -> Result<BridgeHandle, BridgeError> {
    validate_ticket(&config.ticket)?;
    let target = Arc::new(target::Target::new(&config)?);
    let url = url::Url::parse(&config.connect_url).map_err(|_| BridgeError::InvalidConfig)?;
    let local = url
        .host_str()
        .is_some_and(|host| host == "127.0.0.1" || host == "[::1]" || host == "localhost");
    if (url.scheme() != "wss" && !(url.scheme() == "ws" && local))
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(BridgeError::InvalidConfig);
    }
    let mut request = config
        .connect_url
        .into_client_request()
        .map_err(|_| BridgeError::InvalidConfig)?;
    request.headers_mut().insert(
        "Authorization",
        format!("Bearer {}", config.ticket)
            .parse()
            .map_err(|_| BridgeError::InvalidConfig)?,
    );
    request.headers_mut().insert(
        "Sec-WebSocket-Protocol",
        "houston-local-model.v1"
            .parse()
            .map_err(|_| BridgeError::InvalidConfig)?,
    );
    let socket_config = WebSocketConfig::default()
        .max_message_size(Some(wire::MESSAGE))
        .max_frame_size(Some(wire::MESSAGE));
    let (mut socket, response) = tokio::time::timeout(
        Duration::from_secs(10),
        tokio_tungstenite::connect_async_with_config(request, Some(socket_config), true),
    )
    .await
    .map_err(|_| BridgeError::Timeout)?
    .map_err(|_| BridgeError::Connection)?;
    if response
        .headers()
        .get("Sec-WebSocket-Protocol")
        .and_then(|v| v.to_str().ok())
        != Some("houston-local-model.v1")
    {
        return Err(BridgeError::Protocol);
    }
    let ready = tokio::time::timeout(Duration::from_secs(10), socket.next())
        .await
        .map_err(|_| BridgeError::Timeout)?
        .ok_or(BridgeError::Closed)?
        .map_err(|_| BridgeError::Connection)?;
    let wire::Incoming::Ready {
        version: 1,
        generation,
        session_expires_at,
    } = session::decode(ready)?
    else {
        return Err(BridgeError::Protocol);
    };
    if generation == 0 || generation > 9007199254740991 {
        return Err(BridgeError::Protocol);
    }
    let expiry = session::expiry(&session_expires_at)?;
    let callback: Arc<dyn Fn(BridgeStatus) + Send + Sync> = Arc::new(status_callback);
    callback(BridgeStatus::Online {
        generation,
        session_expires_at: session_expires_at.clone(),
    });
    let cancel = CancellationToken::new();
    let (commands, receiver) = mpsc::channel(2);
    let task = tokio::spawn(session::run(
        socket,
        target,
        cancel.clone(),
        receiver,
        callback,
        expiry,
        session_expires_at,
    ));
    Ok(BridgeHandle {
        cancel,
        commands,
        task: Some(task),
    })
}
