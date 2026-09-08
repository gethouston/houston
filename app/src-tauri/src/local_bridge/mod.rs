//! Native lifecycle and secure persistence for the outbound model bridge.
pub mod commands;
mod detection;
pub mod legacy;
mod lifecycle;
mod pending;
mod secrets;
mod state;
#[cfg(test)]
mod tests;
mod types;

use houston_local_model_bridge::BridgeHandle;
use std::sync::Mutex;
use types::{Identity, Status};

static BRIDGE_OP: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
static BRIDGE: Mutex<Option<RunningBridge>> = Mutex::new(None);
static STATUS: Mutex<Option<Status>> = Mutex::new(None);
static EPOCH: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
struct RunningBridge {
    identity: Identity,
    handle: BridgeHandle,
}

pub fn shutdown() {
    pending::cancel_all();
    EPOCH.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    match BRIDGE.lock() {
        Ok(mut bridge) => {
            bridge.take();
        }
        Err(_) => tracing::error!("local bridge shutdown state lock failed"),
    }
}
