mod lifecycle;
mod upload;
use crate::flow::{enqueue, Control};
use crate::{
    stream::{forward, Outbox, Packet},
    target::Target,
    wire::*,
    BridgeError, BridgeStatus,
};
use std::{
    collections::{HashMap, HashSet},
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc,
    },
    time::Duration,
};
use tokio::{
    sync::{mpsc, Semaphore},
    task::JoinSet,
    time::Instant,
};
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

struct Request {
    terminal: Arc<AtomicBool>,
    operation: Operation,
    body: Option<Vec<u8>>,
    sequence: u64,
    credits: Arc<Semaphore>,
    upload_credit: Arc<AtomicUsize>,
    response_outstanding: Arc<AtomicUsize>,
    cancel: CancellationToken,
    started: Instant,
}
pub(super) struct Requests {
    active: HashMap<Uuid, Request>,
    seen: HashSet<Uuid>,
    rejected: HashSet<Uuid>,
    draining: bool,
    target: Arc<Target>,
    data: mpsc::Sender<Packet>,
    control: mpsc::Sender<Control>,
}
impl Requests {
    pub fn new(
        target: Arc<Target>,
        data: mpsc::Sender<Packet>,
        control: mpsc::Sender<Control>,
    ) -> Self {
        Self {
            active: HashMap::new(),
            seen: HashSet::new(),
            rejected: HashSet::new(),
            draining: false,
            target,
            data,
            control,
        }
    }
    fn fail(&mut self, id: Uuid, code: &'static str) -> Result<(), BridgeError> {
        if self
            .active
            .get(&id)
            .is_some_and(|request| request.terminal.load(Ordering::SeqCst))
        {
            return Ok(());
        }
        self.rejected.insert(id);
        if let Some(request) = self.active.remove(&id) {
            request.terminal.store(true, Ordering::SeqCst);
            request.cancel.cancel();
        }
        enqueue(
            &self.control,
            Outgoing::ResponseError {
                request_id: id,
                code,
            },
        )
    }
    pub fn accept(
        &mut self,
        incoming: Incoming,
        tasks: &mut JoinSet<Result<Option<Uuid>, BridgeError>>,
        callback: Arc<dyn Fn(BridgeStatus) + Send + Sync>,
    ) -> Result<(), BridgeError> {
        match incoming {
            Incoming::RequestStart {
                request_id: id,
                operation,
                model,
            } => {
                // Bound replay history for a ten-minute renewable session.
                if self.seen.len() >= 65536 || !self.seen.insert(id) {
                    return Err(BridgeError::Protocol);
                }
                if self.draining || self.active.len() >= 4 {
                    return self.fail(id, "busy");
                }
                if model != self.target.model {
                    return self.fail(id, "invalid_request");
                }
                self.active.insert(
                    id,
                    Request {
                        terminal: Arc::new(AtomicBool::new(false)),
                        operation,
                        body: Some(Vec::new()),
                        sequence: 0,
                        credits: Arc::new(Semaphore::new(WINDOW)),
                        upload_credit: Arc::new(AtomicUsize::new(WINDOW)),
                        response_outstanding: Arc::new(AtomicUsize::new(0)),
                        cancel: CancellationToken::new(),
                        started: Instant::now(),
                    },
                );
            }
            Incoming::RequestChunk {
                request_id: id,
                sequence,
                data,
            } => {
                self.upload(id, sequence, data)?;
            }
            Incoming::RequestEnd { request_id: id } => {
                if self.rejected.contains(&id) {
                    return Ok(());
                }
                let request = self.active.get_mut(&id).ok_or(BridgeError::Protocol)?;
                let body = request.body.take().ok_or(BridgeError::Protocol)?;
                let (target, data, control) =
                    (self.target.clone(), self.data.clone(), self.control.clone());
                let (credits, cancel, operation) = (
                    request.credits.clone(),
                    request.cancel.clone(),
                    request.operation,
                );
                let terminal = request.terminal.clone();
                let outbox = Outbox {
                    sender: data,
                    cancel: cancel.clone(),
                    terminal: terminal.clone(),
                    outstanding: request.response_outstanding.clone(),
                };
                tasks.spawn(async move {
                    let result = tokio::select! {
                        biased;
                        _ = cancel.cancelled() => return Ok(Some(id)),
                        result = tokio::time::timeout(Duration::from_secs(1800), forward(target, id, operation, body, credits, outbox)) => {
                            match result { Ok(result) => result, Err(_) => Err("timeout") }
                        }
                    };
                    if let Err(code) = result {
                        if terminal.swap(true, Ordering::SeqCst) { return Ok(Some(id)); }
                        if code == "model_unavailable" { callback(BridgeStatus::ModelUnavailable); }
                        enqueue(&control, Outgoing::ResponseError { request_id: id, code })?;
                    }
                    Ok(Some(id))
                });
            }
            Incoming::Cancel { request_id: id } => {
                if self.active.contains_key(&id) {
                    self.fail(id, "cancelled")?;
                } else if !self.seen.contains(&id) {
                    return Err(BridgeError::Protocol);
                }
            }
            Incoming::Window {
                request_id: id,
                direction: ResponseDirection::Response,
                bytes,
            } => {
                if let Some(request) = self.active.get(&id) {
                    if bytes == 0
                        || bytes > WINDOW
                        || request.credits.available_permits() + bytes > WINDOW
                    {
                        return Err(BridgeError::Protocol);
                    }
                    crate::flow::consume(&request.response_outstanding, bytes)?;
                    request.credits.add_permits(bytes);
                } else if !self.seen.contains(&id) {
                    return Err(BridgeError::Protocol);
                }
            }
            _ => return Err(BridgeError::Protocol),
        }
        Ok(())
    }
}
