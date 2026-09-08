//! Legacy secrets are transient proof material. Reading never assigns an owner.
use super::types::{Identity, Phase};
use serde::{Deserialize, Serialize};
use std::io::Read;
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyCandidate {
    pub target_base_url: String,
    pub proxy_key: String,
    pub app_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub local_api_key: Option<String>,
}
#[tauri::command]
pub async fn local_bridge_legacy_candidate(
    identity: Identity,
) -> Result<Option<LegacyCandidate>, String> {
    identity.key("journal")?;
    if crate::auth::auth_get_item(identity.key("migration")?)
        .await?
        .is_some()
    {
        return Ok(None);
    }
    let path = crate::houston_dir().join("local-bridge/state.json");
    let file = match std::fs::File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("Cannot read saved local bridge".into()),
    };
    let mut bytes = Vec::new();
    file.take(16385)
        .read_to_end(&mut bytes)
        .map_err(|_| "Cannot read saved local bridge")?;
    if bytes.len() > 16384 {
        return Err("Saved local bridge is too large".into());
    }
    let candidate: LegacyCandidate =
        serde_json::from_slice(&bytes).map_err(|_| "Invalid saved local bridge")?;
    if candidate.proxy_key.is_empty() || candidate.proxy_key.len() > 4096 {
        return Err("Invalid saved bridge credential".into());
    }
    Ok(Some(candidate))
}
/// Commit a migration marker only after SDK saved an authenticated descriptor
/// and endpoint. Keep original bytes for recovery; no destructive migration.
#[tauri::command]
pub async fn local_bridge_complete_migration(identity: Identity) -> Result<(), String> {
    let _op = super::BRIDGE_OP.lock().await;
    let journal = super::state::load(&identity)
        .await?
        .ok_or("No bridge migration journal")?;
    if !matches!(journal.phase, Phase::Committed) {
        return Err("Bridge migration is not committed".into());
    }
    crate::auth::auth_set_item(
        identity.key("migration")?,
        journal.idempotency_key.to_string(),
    )
    .await
}
