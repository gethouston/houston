//! Persistence for the local-bridge descriptor.
//!
//! A successful `start_local_bridge` writes a private descriptor to
//! `~/.houston/local-bridge/state.json` (0600) so the bridge can be
//! re-established after an app restart WITHOUT re-minting the proxy key — the
//! cloud agent's registered endpoint apiKey is that key, so reusing it keeps the
//! endpoint valid. The file holds secrets (`proxyKey`, optional `localApiKey`)
//! and is NEVER handed to the frontend; only the redacted [`SavedBridgeTarget`]
//! subset crosses the IPC boundary.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// The private on-disk descriptor. Secrets (`proxy_key`, `local_api_key`) never
/// leave the Rust side — see [`BridgeDescriptor::to_saved`].
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeDescriptor {
    pub target_base_url: String,
    /// `wss` | `tcp`.
    pub transport: String,
    /// The local server's own API key, if it needs one. Optional.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub local_api_key: Option<String>,
    /// The bearer minted for the auth proxy — reused verbatim on reconnect.
    pub proxy_key: String,
    /// Human label for the tunnelled server (derived from the origin if the
    /// caller didn't supply one).
    pub app_name: String,
}

/// The frontend-visible subset of a saved descriptor — no secrets.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedBridgeTarget {
    pub target_base_url: String,
    pub transport: String,
    pub app_name: String,
}

impl BridgeDescriptor {
    pub fn to_saved(&self) -> SavedBridgeTarget {
        SavedBridgeTarget {
            target_base_url: self.target_base_url.clone(),
            transport: self.transport.clone(),
            app_name: self.app_name.clone(),
        }
    }
}

/// Persist `desc` under the real Houston data dir.
pub fn save(desc: &BridgeDescriptor) -> Result<(), String> {
    save_in(&crate::houston_dir(), desc)
}

/// Load the saved descriptor, or `Ok(None)` if none exists.
pub fn load() -> Result<Option<BridgeDescriptor>, String> {
    load_in(&crate::houston_dir())
}

/// Delete the saved descriptor (idempotent — absent is not an error).
pub fn delete() -> Result<(), String> {
    delete_in(&crate::houston_dir())
}

fn descriptor_path(base: &Path) -> PathBuf {
    base.join("local-bridge").join("state.json")
}

fn save_in(base: &Path, desc: &BridgeDescriptor) -> Result<(), String> {
    let path = descriptor_path(base);
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("bridge-state: create dir: {e}"))?;
    }
    let json =
        serde_json::to_vec_pretty(desc).map_err(|e| format!("bridge-state: serialize: {e}"))?;
    write_private(&path, &json)
}

fn load_in(base: &Path) -> Result<Option<BridgeDescriptor>, String> {
    let path = descriptor_path(base);
    let bytes = match std::fs::read(&path) {
        Ok(b) => b,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(format!("bridge-state: read: {e}")),
    };
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|e| format!("bridge-state: parse {}: {e}", path.display()))
}

fn delete_in(base: &Path) -> Result<(), String> {
    let path = descriptor_path(base);
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("bridge-state: delete: {e}")),
    }
}

/// Write `bytes` to `path` owner-only (0600). On unix the file is created with
/// mode 0600 AND re-chmod'd so a pre-existing looser file is tightened too.
fn write_private(path: &Path, bytes: &[u8]) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::io::Write;
        use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
        let mut f = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(path)
            .map_err(|e| format!("bridge-state: open: {e}"))?;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
            .map_err(|e| format!("bridge-state: chmod: {e}"))?;
        f.write_all(bytes)
            .map_err(|e| format!("bridge-state: write: {e}"))
    }
    #[cfg(not(unix))]
    {
        std::fs::write(path, bytes).map_err(|e| format!("bridge-state: write: {e}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A unique scratch dir under the OS temp root (no tempfile dep).
    fn scratch() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "houston-bridge-state-{}-{}",
            std::process::id(),
            crate::local_bridge::keys::generate_proxy_key()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn descriptor() -> BridgeDescriptor {
        BridgeDescriptor {
            target_base_url: "http://127.0.0.1:1234/v1".to_string(),
            transport: "wss".to_string(),
            local_api_key: Some("upstream-secret".to_string()),
            proxy_key: "deadbeef".to_string(),
            app_name: "LM Studio".to_string(),
        }
    }

    #[test]
    fn save_load_delete_round_trip() {
        let base = scratch();
        assert_eq!(load_in(&base).unwrap(), None);
        let desc = descriptor();
        save_in(&base, &desc).unwrap();
        assert_eq!(load_in(&base).unwrap(), Some(desc));
        delete_in(&base).unwrap();
        assert_eq!(load_in(&base).unwrap(), None);
        // Deleting again is a no-op, not an error.
        delete_in(&base).unwrap();
        std::fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn descriptor_persists_camel_case_and_omits_none_key() {
        let base = scratch();
        let mut desc = descriptor();
        desc.local_api_key = None;
        save_in(&base, &desc).unwrap();
        let raw = std::fs::read_to_string(descriptor_path(&base)).unwrap();
        assert!(raw.contains("\"targetBaseUrl\""));
        assert!(raw.contains("\"proxyKey\""));
        assert!(raw.contains("\"appName\""));
        assert!(!raw.contains("localApiKey"), "None key must be omitted");
        std::fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn to_saved_drops_secrets() {
        let saved = descriptor().to_saved();
        let json = serde_json::to_string(&saved).unwrap();
        assert!(json.contains("\"targetBaseUrl\":\"http://127.0.0.1:1234/v1\""));
        assert!(json.contains("\"transport\":\"wss\""));
        assert!(json.contains("\"appName\":\"LM Studio\""));
        assert!(!json.contains("proxyKey"));
        assert!(!json.contains("localApiKey"));
        assert!(!json.contains("upstream-secret"));
    }

    #[cfg(unix)]
    #[test]
    fn saved_file_is_owner_only() {
        use std::os::unix::fs::PermissionsExt;
        let base = scratch();
        save_in(&base, &descriptor()).unwrap();
        let mode = std::fs::metadata(descriptor_path(&base))
            .unwrap()
            .permissions()
            .mode()
            & 0o777;
        assert_eq!(mode, 0o600, "descriptor must be 0600, was {mode:o}");
        std::fs::remove_dir_all(&base).ok();
    }
}
