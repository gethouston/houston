//! Identity-scoped native commands; SDK owns remote registration and reconnect.
use super::{detection, lifecycle, state, types::*, BRIDGE_OP};
use tauri::AppHandle;

#[tauri::command]
pub async fn detect_local_models() -> Vec<detection::DetectedServer> {
    detection::detect().await
}
#[tauri::command]
pub async fn local_bridge_device(identity: Identity) -> Result<Device, String> {
    let _op = BRIDGE_OP.lock().await;
    state::device(&identity).await
}
#[tauri::command]
pub async fn saved_bridge_target(identity: Identity) -> Result<Option<Journal>, String> {
    let _op = BRIDGE_OP.lock().await;
    state::load(&identity).await
}
#[tauri::command]
pub async fn save_bridge_target(identity: Identity, journal: Journal) -> Result<(), String> {
    let _op = BRIDGE_OP.lock().await;
    state::save(&identity, &journal).await
}
#[tauri::command]
pub async fn forget_bridge_target(identity: Identity) -> Result<(), String> {
    super::pending::cancel(&identity)?;
    let _op = BRIDGE_OP.lock().await;
    lifecycle::stop(&identity).await?;
    if let Some(journal) = state::load(&identity).await? {
        state::local_key(
            &identity,
            &journal.input.target_base_url,
            &journal.input.model,
            Some(String::new()),
        )
        .await?;
    }
    crate::auth::auth_remove_item(identity.key("journal")?).await
}
#[tauri::command]
pub async fn start_local_bridge(app: AppHandle, args: StartArgs) -> Result<StartResult, String> {
    args.identity.key("journal")?;
    let pending = super::pending::DialGuard::begin(&args.identity)?;
    tokio::select! {
        biased;
        _ = pending.cancel.cancelled() => Err("Bridge connection cancelled".into()),
        result = async {
            let _op = BRIDGE_OP.lock().await;
            lifecycle::start(app, args).await
        } => result,
    }
}
#[tauri::command]
pub async fn renew_local_bridge(identity: Identity, ticket: String) -> Result<(), String> {
    identity.key("journal")?;
    let pending = super::pending::DialGuard::begin(&identity)?;
    tokio::select! {
        biased;
        _ = pending.cancel.cancelled() => Err("Bridge renewal cancelled".into()),
        result = async {
    let _op = BRIDGE_OP.lock().await;
            lifecycle::renew(identity, ticket).await
        } => result,
    }
}
#[tauri::command]
pub async fn stop_local_bridge(identity: Identity) -> Result<(), String> {
    super::pending::cancel(&identity)?;
    let _op = BRIDGE_OP.lock().await;
    identity.key("journal")?;
    lifecycle::stop(&identity).await
}
