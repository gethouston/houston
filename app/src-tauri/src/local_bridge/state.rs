//! Identity-scoped journals and credentials use the platform authentication store.
use super::types::{Device, Identity, Journal, Phase};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::RngCore;

pub async fn device(identity: &Identity) -> Result<Device, String> {
    let key = identity.key("device")?;
    if let Some(value) = super::secrets::get(key.clone()).await? {
        return serde_json::from_str(&value).map_err(|_| "Invalid stored bridge device".into());
    }
    let mut bytes = [0u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    let device = Device {
        device_id: uuid::Uuid::new_v4(),
        device_secret: URL_SAFE_NO_PAD.encode(bytes),
    };
    let value = serde_json::to_string(&device).map_err(|_| "Cannot encode bridge device")?;
    super::secrets::set(key, value).await?;
    Ok(device)
}
pub async fn load(identity: &Identity) -> Result<Option<Journal>, String> {
    let Some(value) = crate::auth::auth_get_item(identity.key("journal")?).await? else {
        return Ok(None);
    };
    let journal: Journal =
        serde_json::from_str(&value).map_err(|_| "Invalid stored bridge journal")?;
    validate(identity, &journal)?;
    Ok(Some(journal))
}
pub fn validate(identity: &Identity, journal: &Journal) -> Result<(), String> {
    if journal.version != 1
        || &journal.identity != identity
        || journal.input.model.is_empty()
        || journal.input.model.len() > 256
        || journal.input.target_base_url.len() > 4096
    {
        return Err("Invalid bridge journal".into());
    }
    if let Some(descriptor) = &journal.descriptor {
        if descriptor.user_id != identity.user_id
            || descriptor.org_id != identity.org_id
            || descriptor.model != journal.input.model
            || descriptor.revision > 9007199254740991
        {
            return Err("Bridge journal identity mismatch".into());
        }
    } else if !matches!(journal.phase, Phase::Prepared) {
        return Err("Missing bridge descriptor".into());
    }
    Ok(())
}
pub async fn save(identity: &Identity, journal: &Journal) -> Result<(), String> {
    validate(identity, journal)?;
    let value = serde_json::to_string(journal).map_err(|_| "Cannot encode bridge journal")?;
    if value.len() > 16384 {
        return Err("Bridge journal is too large".into());
    }
    crate::auth::auth_set_item(identity.key("journal")?, value).await
}
pub async fn local_key(
    identity: &Identity,
    target: &str,
    model: &str,
    supplied: Option<String>,
) -> Result<Option<String>, String> {
    use sha2::{Digest, Sha256};
    let scope = serde_json::to_vec(&(target, model)).map_err(|_| "Invalid bridge target")?;
    let key = format!("{}-{:x}", identity.key("model-key")?, Sha256::digest(scope));
    if let Some(secret) = supplied {
        if secret.len() > 8192 {
            return Err("Local model key is too large".into());
        }
        if secret.is_empty() {
            super::secrets::remove(key).await?;
            return Ok(None);
        }
        super::secrets::set(key, secret.clone()).await?;
        return Ok(Some(secret));
    }
    super::secrets::get(key).await
}
