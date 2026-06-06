//! Keychain-backed storage for Supabase auth sessions + deep-link callback
//! handling for Google OAuth.
//!
//! Storage layout per OS:
//! - **macOS**: `keyring` crate writes to the user's Keychain under
//!   `com.houston.app.auth`. Apple Keychain has no per-blob size limit
//!   that matters for our session sizes, so this Just Works.
//! - **Windows**: per-user **DPAPI-encrypted file** under
//!   `%LOCALAPPDATA%\com.houston.app\auth\<key>.dpapi`. We do NOT use
//!   Credential Manager here because its `CredentialBlob` field caps at
//!   ~2560 bytes, and a Supabase session — a JWT access_token plus
//!   user metadata plus refresh_token plus provider_token — is
//!   reliably 3-4 KB. The earlier keyring-based path silently dropped
//!   every session on disk (the `set_password` Err was swallowed by
//!   the JS storage adapter) so every Windows user was forced to
//!   re-sign-in on every app open. DPAPI's `CryptProtectData` has no
//!   such limit and still binds the ciphertext to the Windows user.
//! - **Linux**: `keyring` crate's sync Secret Service backend
//!   (libsecret — gnome-keyring, KWallet, …). Persistent across
//!   reboots like the macOS Keychain. Requires a secret-service
//!   provider running on the user's session; if none is present the
//!   `Entry` calls return an Err that surfaces as a toast (no silent
//!   fallback). See the keyring features in `Cargo.toml`.
//! - **Other Unix**: same `keyring` path; backend availability depends
//!   on the desktop environment. Best-effort, not release-tested.
//!
//! Deep-link flow:
//!   1. Frontend calls `supabase.auth.signInWithOAuth({ provider: "google",
//!      options: { redirectTo: "houston://auth-callback" } })`.
//!   2. User completes consent in their system browser.
//!   3. Supabase redirects to `houston://auth-callback?code=...` (PKCE) or
//!      `houston://auth-callback/#access_token=...` (implicit).
//!   4. macOS hands the URL to the running app via tauri-plugin-deep-link;
//!      Windows hands it via tauri-plugin-single-instance argv forwarding
//!      into the same plugin (see `lib.rs`).
//!   5. This module emits `auth://deep-link` with the URL to the frontend.
//!   6. Frontend calls `supabase.auth.exchangeCodeForSession(code)` for
//!      PKCE or `setSession({access_token, refresh_token})` for implicit
//!      — and writes the result directly into the TanStack Query cache so
//!      the auth gate flips without relying on supabase's listener.

use tauri::{AppHandle, Emitter};

#[cfg(not(target_os = "windows"))]
const SERVICE: &str = "com.houston.app.auth";

/// Reject keys that try to escape the storage directory. Supabase only
/// ever passes its own well-formed storage keys, but the API surface is
/// reachable from the webview so we still sanitize.
fn validate_key(key: &str) -> Result<(), String> {
    if key.is_empty() {
        return Err("auth key must not be empty".into());
    }
    if key.contains('/') || key.contains('\\') || key.contains("..") || key.contains('\0') {
        return Err(format!("auth key contains invalid characters: {key:?}"));
    }
    Ok(())
}

#[cfg(target_os = "windows")]
mod storage {
    //! DPAPI-encrypted file storage.

    use std::path::PathBuf;
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPT_INTEGER_BLOB,
    };

    fn auth_dir() -> Result<PathBuf, String> {
        let local =
            dirs::data_local_dir().ok_or_else(|| "no LocalAppData dir".to_string())?;
        let dir = local.join("com.houston.app").join("auth");
        std::fs::create_dir_all(&dir)
            .map_err(|e| format!("create auth dir {}: {e}", dir.display()))?;
        Ok(dir)
    }

    fn file_for(key: &str) -> Result<PathBuf, String> {
        Ok(auth_dir()?.join(format!("{key}.dpapi")))
    }

    /// Wrap a slice in a `CRYPT_INTEGER_BLOB` for the duration of the call.
    /// The blob does not own the data — it borrows the slice's pointer
    /// for `CryptProtectData` / `CryptUnprotectData`.
    fn blob_from_slice(bytes: &[u8]) -> CRYPT_INTEGER_BLOB {
        CRYPT_INTEGER_BLOB {
            cbData: bytes.len() as u32,
            pbData: bytes.as_ptr() as *mut u8,
        }
    }

    fn encrypt(plaintext: &[u8]) -> Result<Vec<u8>, String> {
        let mut input = blob_from_slice(plaintext);
        let mut output = CRYPT_INTEGER_BLOB {
            cbData: 0,
            pbData: std::ptr::null_mut(),
        };
        let ok = unsafe {
            CryptProtectData(
                &mut input,
                std::ptr::null(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                0,
                &mut output,
            )
        };
        if ok == 0 {
            return Err(format!(
                "CryptProtectData failed (last error {})",
                unsafe { windows_sys::Win32::Foundation::GetLastError() }
            ));
        }
        let result = unsafe {
            std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec()
        };
        unsafe {
            LocalFree(output.pbData as _);
        }
        Ok(result)
    }

    fn decrypt(ciphertext: &[u8]) -> Result<Vec<u8>, String> {
        let mut input = blob_from_slice(ciphertext);
        let mut output = CRYPT_INTEGER_BLOB {
            cbData: 0,
            pbData: std::ptr::null_mut(),
        };
        let ok = unsafe {
            CryptUnprotectData(
                &mut input,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                0,
                &mut output,
            )
        };
        if ok == 0 {
            return Err(format!(
                "CryptUnprotectData failed (last error {})",
                unsafe { windows_sys::Win32::Foundation::GetLastError() }
            ));
        }
        let result = unsafe {
            std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec()
        };
        unsafe {
            LocalFree(output.pbData as _);
        }
        Ok(result)
    }

    pub fn get(key: &str) -> Result<Option<String>, String> {
        let path = file_for(key)?;
        let ciphertext = match std::fs::read(&path) {
            Ok(b) => b,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(format!("read {}: {e}", path.display())),
        };
        let plaintext = decrypt(&ciphertext)?;
        String::from_utf8(plaintext)
            .map(Some)
            .map_err(|e| format!("session blob not utf-8: {e}"))
    }

    pub fn set(key: &str, value: &str) -> Result<(), String> {
        let path = file_for(key)?;
        let ciphertext = encrypt(value.as_bytes())?;
        // Write to a temp file and atomic-rename into place so a crash
        // mid-write never leaves a half-encrypted blob that future
        // decrypt calls would barf on.
        let tmp = path.with_extension("dpapi.tmp");
        std::fs::write(&tmp, &ciphertext)
            .map_err(|e| format!("write {}: {e}", tmp.display()))?;
        std::fs::rename(&tmp, &path)
            .map_err(|e| format!("rename {} -> {}: {e}", tmp.display(), path.display()))?;
        Ok(())
    }

    pub fn remove(key: &str) -> Result<(), String> {
        let path = file_for(key)?;
        match std::fs::remove_file(&path) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(format!("remove {}: {e}", path.display())),
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod storage {
    //! macOS Keychain / generic libsecret storage via the `keyring` crate.

    use keyring::Entry;
    use super::SERVICE;

    fn entry(key: &str) -> Result<Entry, String> {
        Entry::new(SERVICE, key).map_err(|e| format!("keyring entry({key}): {e}"))
    }

    pub fn get(key: &str) -> Result<Option<String>, String> {
        let e = entry(key)?;
        match e.get_password() {
            Ok(v) => Ok(Some(v)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(err) => Err(format!("keyring get({key}): {err}")),
        }
    }

    pub fn set(key: &str, value: &str) -> Result<(), String> {
        let e = entry(key)?;
        e.set_password(value)
            .map_err(|err| format!("keyring set({key}): {err}"))
    }

    pub fn remove(key: &str) -> Result<(), String> {
        let e = entry(key)?;
        match e.delete_credential() {
            Ok(_) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(err) => Err(format!("keyring delete({key}): {err}")),
        }
    }
}

#[tauri::command(rename_all = "snake_case")]
pub async fn auth_get_item(key: String) -> Result<Option<String>, String> {
    validate_key(&key)?;
    storage::get(&key)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn auth_set_item(key: String, value: String) -> Result<(), String> {
    validate_key(&key)?;
    storage::set(&key, &value)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn auth_remove_item(key: String) -> Result<(), String> {
    validate_key(&key)?;
    storage::remove(&key)
}

/// Forward a deep-link URL to the frontend. Called by the tauri-plugin-deep-link
/// handler installed in `lib.rs`. The frontend extracts the `code` (PKCE) or
/// `access_token` + `refresh_token` (implicit) and installs the session.
pub fn emit_deep_link(handle: &AppHandle, url: &str) {
    if let Err(e) = handle.emit("auth://deep-link", url) {
        tracing::error!("[auth] failed to emit deep-link event: {e}");
    }
}

/// Best-effort read of the persisted Supabase session, returning the user_id
/// if present. Called at engine spawn time so the subprocess can stamp
/// `HOUSTON_APP_USER_ID` on its own operations. Failures (no entry, corrupt
/// JSON, keychain locked, DPAPI ciphertext from a different Windows user)
/// all resolve to `None` silently — the engine runs fine without an identity.
pub fn persisted_user_id() -> Option<String> {
    if option_env!("HOUSTON_AUTH_STORAGE_MODE") != Some("keychain") {
        return None;
    }
    // Storage key must match `storageKey` in app/src/lib/supabase.ts.
    let raw = storage::get("houston-auth").ok().flatten()?;
    let parsed: serde_json::Value = serde_json::from_str(&raw).ok()?;
    parsed
        .get("user")
        .and_then(|u| u.get("id"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_key_rejects_traversal() {
        assert!(validate_key("../escape").is_err());
        assert!(validate_key("a/b").is_err());
        assert!(validate_key("a\\b").is_err());
        assert!(validate_key("a\0b").is_err());
        assert!(validate_key("").is_err());
    }

    #[test]
    fn validate_key_accepts_supabase_keys() {
        assert!(validate_key("houston-auth").is_ok());
        assert!(validate_key("houston-auth-code-verifier").is_ok());
        assert!(validate_key("houston-auth-local-default").is_ok());
    }

    /// Round-trip set / get / remove against the real Keychain.
    ///
    /// Ignored by default — on first run macOS prompts the developer to
    /// allow Keychain access, and CI has no Keychain at all. Run locally
    /// with `cargo test -p houston-app auth:: -- --ignored`.
    #[tokio::test]
    #[ignore]
    async fn keychain_round_trip() {
        let key = "__houston_test__";
        let _ = auth_remove_item(key.into()).await;

        auth_set_item(key.into(), "hello".into()).await.unwrap();
        let got = auth_get_item(key.into()).await.unwrap();
        assert_eq!(got.as_deref(), Some("hello"));

        auth_remove_item(key.into()).await.unwrap();
        let after = auth_get_item(key.into()).await.unwrap();
        assert!(after.is_none());
    }

    #[test]
    fn local_auth_storage_does_not_read_persisted_keychain_user() {
        if option_env!("HOUSTON_AUTH_STORAGE_MODE") == Some("browser") {
            assert!(persisted_user_id().is_none());
        }
    }
}
