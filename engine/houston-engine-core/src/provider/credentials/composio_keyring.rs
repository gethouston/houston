//! Materialize Composio credentials for cloud export.
//!
//! Composio CLI stores the API key in the OS keyring (`com.composio.cli`,
//! account `default`, value prefixed `b64:`) and leaves `api_key: null` in
//! `~/.composio/user_data.json`. Export must merge the keyring value before sync.

use base64::Engine as _;
use serde_json::{Map, Value};

const USER_DATA_REL: &str = ".composio/user_data.json";
const KEYCHAIN_SERVICE: &str = "com.composio.cli";
const KEYCHAIN_USER: &str = "default";
const DEFAULT_BASE_URL: &str = "https://backend.composio.dev";

/// Bytes for `.composio/user_data.json` when exportable credentials exist.
pub fn export_user_data_bytes() -> Option<Vec<u8>> {
    let existing = read_user_data_file();
    if let Some(ref bytes) = existing {
        if user_data_has_api_key(bytes) {
            return Some(bytes.clone());
        }
    }
    let api_key = resolve_api_key()?;
    let base = existing
        .as_ref()
        .and_then(|b| std::str::from_utf8(b).ok())
        .and_then(|s| serde_json::from_str::<Value>(s).ok());
    merge_user_data_json(base, &api_key)
        .and_then(|v| serde_json::to_vec(&v).ok())
}

pub fn user_data_rel_path() -> &'static str {
    USER_DATA_REL
}

fn read_user_data_file() -> Option<Vec<u8>> {
    let home = dirs::home_dir()?;
    std::fs::read(home.join(".composio").join("user_data.json")).ok()
}

fn user_data_has_api_key(bytes: &[u8]) -> bool {
    let Ok(content) = std::str::from_utf8(bytes) else {
        return false;
    };
    let Ok(value) = serde_json::from_str::<Value>(content) else {
        return false;
    };
    value
        .get("api_key")
        .and_then(|v| v.as_str())
        .is_some_and(|k| !k.trim().is_empty())
}

fn resolve_api_key() -> Option<String> {
    api_key_from_env()
        .or_else(read_keyring_api_key)
        .filter(|k| !k.trim().is_empty())
}

fn api_key_from_env() -> Option<String> {
    std::env::var("COMPOSIO_API_KEY")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn read_keyring_api_key() -> Option<String> {
    let raw = read_keyring_raw()?;
    decode_keyring_api_key(&raw)
}

#[cfg(target_os = "macos")]
fn read_keyring_raw() -> Option<String> {
    let output = std::process::Command::new("security")
        .args([
            "find-generic-password",
            "-s",
            KEYCHAIN_SERVICE,
            "-a",
            KEYCHAIN_USER,
            "-w",
        ])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

#[cfg(target_os = "linux")]
fn read_keyring_raw() -> Option<String> {
    let output = std::process::Command::new("secret-tool")
        .args([
            "lookup",
            "service",
            KEYCHAIN_SERVICE,
            "username",
            KEYCHAIN_USER,
            "target",
            "default",
        ])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
fn read_keyring_raw() -> Option<String> {
    None
}

/// Decode Composio keyring value (`b64:<standard-base64>` or plaintext).
pub(crate) fn decode_keyring_api_key(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    let payload = trimmed
        .strip_prefix("b64:")
        .map(str::trim)
        .unwrap_or(trimmed);
    if payload.is_empty() {
        return None;
    }
    if trimmed.starts_with("b64:") {
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(payload)
            .ok()?;
        String::from_utf8(bytes)
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
    } else {
        Some(payload.to_string())
    }
}

/// Merge resolved API key into existing user_data JSON.
pub(crate) fn merge_user_data_json(existing: Option<Value>, api_key: &str) -> Option<Value> {
    if api_key.trim().is_empty() {
        return None;
    }
    let mut obj: Map<String, Value> = existing
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default();
    obj.insert("api_key".to_string(), Value::String(api_key.to_string()));
    match obj.get("base_url").and_then(|v| v.as_str()) {
        None | Some("") => {
            obj.insert(
                "base_url".to_string(),
                Value::String(DEFAULT_BASE_URL.to_string()),
            );
        }
        _ => {}
    }
    Some(Value::Object(obj))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_env_lock::lock_env_test;

    #[test]
    fn decode_keyring_api_key_strips_b64_prefix() {
        let encoded = base64::engine::general_purpose::STANDARD.encode("ak_test_composio");
        let decoded = decode_keyring_api_key(&format!("b64:{encoded}")).unwrap();
        assert_eq!(decoded, "ak_test_composio");
    }

    #[test]
    fn decode_keyring_api_key_accepts_plaintext() {
        assert_eq!(
            decode_keyring_api_key("ak_plain").as_deref(),
            Some("ak_plain")
        );
    }

    #[test]
    fn decode_keyring_api_key_rejects_empty() {
        assert!(decode_keyring_api_key("").is_none());
        assert!(decode_keyring_api_key("b64:").is_none());
    }

    #[test]
    fn merge_user_data_json_preserves_org_and_web_url() {
        let merged = merge_user_data_json(
            Some(serde_json::json!({
                "api_key": null,
                "web_url": "https://app.composio.dev",
                "org_id": "org_123"
            })),
            "ak_merged",
        )
        .unwrap();
        assert_eq!(merged["api_key"], "ak_merged");
        assert_eq!(merged["base_url"], DEFAULT_BASE_URL);
        assert_eq!(merged["web_url"], "https://app.composio.dev");
        assert_eq!(merged["org_id"], "org_123");
    }

    #[test]
    fn merge_user_data_json_keeps_existing_base_url() {
        let merged = merge_user_data_json(
            Some(serde_json::json!({ "base_url": "https://custom.example" })),
            "ak_merged",
        )
        .unwrap();
        assert_eq!(merged["base_url"], "https://custom.example");
    }

    #[test]
    fn export_user_data_bytes_uses_env_when_file_has_null_key() {
        let _guard = lock_env_test();
        let tmp = tempfile::TempDir::new().unwrap();
        let prior_home = std::env::var_os("HOME");
        let prior_key = std::env::var_os("COMPOSIO_API_KEY");
        std::env::set_var("HOME", tmp.path());
        std::env::set_var("COMPOSIO_API_KEY", "ak_from_env");
        let composio_dir = tmp.path().join(".composio");
        std::fs::create_dir_all(&composio_dir).unwrap();
        std::fs::write(
            composio_dir.join("user_data.json"),
            r#"{"api_key":null,"org_id":"org_test"}"#,
        )
        .unwrap();

        let bytes = export_user_data_bytes().expect("export");
        let parsed: Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(parsed["api_key"], "ak_from_env");
        assert_eq!(parsed["org_id"], "org_test");

        match prior_home {
            Some(v) => std::env::set_var("HOME", v),
            None => std::env::remove_var("HOME"),
        }
        match prior_key {
            Some(v) => std::env::set_var("COMPOSIO_API_KEY", v),
            None => std::env::remove_var("COMPOSIO_API_KEY"),
        }
    }
}
