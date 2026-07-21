//! Keychain-backed storage for the identity session + the `auth://deep-link`
//! event bridge used by the desktop OAuth loopback.
//!
//! Storage layout per OS:
//! - **macOS**: `keyring` crate writes to the user's Keychain under
//!   `com.houston.app.auth`. Apple Keychain has no per-blob size limit
//!   that matters for our session sizes, so this Just Works.
//! - **Windows**: per-user **DPAPI-encrypted file** under
//!   `%LOCALAPPDATA%\com.houston.app\auth\<key>.dpapi`. We do NOT use
//!   Credential Manager here because its `CredentialBlob` field caps at
//!   ~2560 bytes, and a stored session — a JWT ID token plus refresh
//!   token plus user metadata — can exceed that. The earlier keyring-based
//!   path silently dropped every session on disk (the `set_password` Err was
//!   swallowed by the JS storage adapter) so every Windows user was forced to
//!   re-sign-in on every app open. DPAPI's `CryptProtectData` has no
//!   such limit and still binds the ciphertext to the Windows user.
//! - **Linux / other Unix**: the desktop's **Secret Service**
//!   (gnome-keyring / KWallet over D-Bus, `keyring` with
//!   `sync-secret-service`) is the primary store. When no daemon is
//!   reachable (headless boxes, minimal WMs) we fall back to a plain
//!   0600 file under the per-user data dir — persistence beats failing
//!   the whole sign-in flow. NOTE: without a Linux keyring feature the
//!   `keyring` crate silently compiles an in-memory mock (writes vanish,
//!   reads always miss) — that shipped in AppImages ≤0.5.20 and forced a
//!   fresh sign-in on every launch. The Cargo.toml features and this
//!   fallback exist so it can never happen again.
//!
//! The storage is identity-provider-agnostic: `auth_get_item` /
//! `auth_set_item` / `auth_remove_item` round-trip an opaque session JSON blob
//! for the TS session store (`app/src/lib/identity/session-store.ts`).
//!
//! Deep-link bridge: `emit_deep_link` emits the `auth://deep-link` event
//! carrying the loopback callback URL. The JS identity layer parses `code` /
//! `state` off it and runs the PKCE exchange + GCIP (Firebase) sign-in
//! (`app/src/lib/identity/oauth-callback.ts`); the PKCE verifier stays in memory
//! and the resulting session (ID token + refresh token) is written to the
//! Keychain-backed store here.

use tauri::{AppHandle, Emitter};

#[cfg(not(target_os = "windows"))]
const SERVICE: &str = "com.houston.app.auth";

/// Reject keys that try to escape the storage directory. The TS session store
/// only ever passes its own well-formed storage keys, but the API surface is
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
        let local = dirs::data_local_dir().ok_or_else(|| "no LocalAppData dir".to_string())?;
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
            return Err(format!("CryptProtectData failed (last error {})", unsafe {
                windows_sys::Win32::Foundation::GetLastError()
            }));
        }
        let result =
            unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec() };
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
        let result =
            unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec() };
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
        std::fs::write(&tmp, &ciphertext).map_err(|e| format!("write {}: {e}", tmp.display()))?;
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
mod keyring_store {
    //! macOS Keychain / Linux Secret Service via the `keyring` crate.

    use super::SERVICE;
    use keyring::Entry;

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

#[cfg(target_os = "macos")]
mod storage {
    //! macOS: Keychain only. It is always present; no fallback needed.
    pub use super::keyring_store::{get, remove, set};
}

/// Plain-file session storage — the Linux fallback when no Secret Service
/// daemon is reachable. Dir-parameterized so the round-trip is unit-testable
/// on every Unix; the Linux `storage` module binds it to the real data dir.
/// Files are 0600 in `<data_local_dir>/com.houston.app/auth/<key>.auth`
/// (same layout as the Windows DPAPI store, minus DPAPI — Linux has no
/// user-bound encryption primitive without a keyring daemon, and a
/// mode-0600 file is the accepted fallback posture for CLI/desktop tokens).
#[cfg(all(unix, any(test, not(target_os = "macos"))))]
mod file_store {
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;
    use std::path::{Path, PathBuf};

    fn file_for(dir: &Path, key: &str) -> PathBuf {
        dir.join(format!("{key}.auth"))
    }

    pub fn get(dir: &Path, key: &str) -> Result<Option<String>, String> {
        let path = file_for(dir, key);
        match std::fs::read_to_string(&path) {
            Ok(v) => Ok(Some(v)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(format!("read {}: {e}", path.display())),
        }
    }

    pub fn set(dir: &Path, key: &str, value: &str) -> Result<(), String> {
        std::fs::create_dir_all(dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
        let path = file_for(dir, key);
        // Write 0600 to a temp file and atomic-rename into place, so a crash
        // mid-write never leaves a truncated blob and the file is never
        // readable by other users, even transiently.
        let tmp = path.with_extension("auth.tmp");
        let mut f = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(&tmp)
            .map_err(|e| format!("open {}: {e}", tmp.display()))?;
        f.write_all(value.as_bytes())
            .and_then(|()| f.sync_all())
            .map_err(|e| format!("write {}: {e}", tmp.display()))?;
        drop(f);
        std::fs::rename(&tmp, &path)
            .map_err(|e| format!("rename {} -> {}: {e}", tmp.display(), path.display()))
    }

    pub fn remove(dir: &Path, key: &str) -> Result<(), String> {
        let path = file_for(dir, key);
        match std::fs::remove_file(&path) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(format!("remove {}: {e}", path.display())),
        }
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
mod storage {
    //! Linux (and other non-mac Unix): Secret Service first, file fallback.
    //!
    //! Read: keyring hit wins; a keyring miss or error falls through to the
    //! file (covering sessions written while the daemon was unavailable).
    //! Write: keyring first; on success the fallback file is deleted so it
    //! can never serve a stale session; on failure the file takes the write
    //! (logged loudly — this is the documented boot/storage-path exception
    //! to no-silent-failures: the user-visible flow still succeeds).
    //! Remove: both stores; a keyring error is logged but does not block
    //! sign-out for file-fallback users with no reachable daemon.

    use super::{file_store, keyring_store};
    use std::path::PathBuf;

    fn auth_dir() -> Result<PathBuf, String> {
        let base = dirs::data_local_dir().ok_or_else(|| "no XDG data dir".to_string())?;
        Ok(base.join("com.houston.app").join("auth"))
    }

    pub fn get(key: &str) -> Result<Option<String>, String> {
        match keyring_store::get(key) {
            Ok(Some(v)) => Ok(Some(v)),
            Ok(None) => file_store::get(&auth_dir()?, key),
            Err(e) => {
                tracing::warn!("[auth] secret service get failed, trying file fallback: {e}");
                file_store::get(&auth_dir()?, key)
            }
        }
    }

    pub fn set(key: &str, value: &str) -> Result<(), String> {
        match keyring_store::set(key, value) {
            Ok(()) => {
                // The keyring copy is now canonical; drop any stale fallback
                // file. Cleanup only — the write itself already succeeded.
                if let Err(e) = auth_dir().and_then(|d| file_store::remove(&d, key)) {
                    tracing::warn!("[auth] fallback file cleanup after keyring set failed: {e}");
                }
                Ok(())
            }
            Err(e) => {
                tracing::warn!("[auth] secret service set failed, using file fallback: {e}");
                file_store::set(&auth_dir()?, key, value)
            }
        }
    }

    pub fn remove(key: &str) -> Result<(), String> {
        let keyring_result = keyring_store::remove(key);
        file_store::remove(&auth_dir()?, key)?;
        if let Err(e) = keyring_result {
            // No reachable daemon ⇒ nothing persisted there anyway; a real
            // daemon error is worth the log line but must not wedge sign-out.
            tracing::warn!("[auth] secret service delete failed (file store cleared): {e}");
        }
        Ok(())
    }
}

/// The release session key the TS session store writes (`auth-storage.ts`
/// RELEASE_AUTH_STORAGE_KEY). Dev builds keep sessions in localStorage
/// instead, so a debug shell simply finds nothing here.
const SESSION_KEY: &str = "houston-auth";

/// Read the persisted session blob, if any — the shell parses the signed-in
/// user's identity out of it at sidecar spawn (`lib.rs::engine_identity_env`).
/// A read error is worth a log line (a broken keychain is diagnosable), but
/// never blocks the boot: identity is an enrichment, not a dependency.
pub fn stored_session_json() -> Option<String> {
    match storage::get(SESSION_KEY) {
        Ok(value) => value,
        Err(e) => {
            tracing::warn!("[auth] stored session read failed at boot: {e}");
            None
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

/// True iff a real OS deep link is the OAuth-callback shape the identity layer
/// consumes (`houston://auth-callback?...`) — the Apple bridge's return path.
/// Everything else (`houston://open`, unknown paths) stays a focus affordance
/// only, so an arbitrary link can never inject noise onto the auth channel.
pub fn is_auth_callback_deep_link(url: &str) -> bool {
    match url.strip_prefix("houston://auth-callback") {
        Some(rest) => rest.is_empty() || rest.starts_with('?') || rest.starts_with('/'),
        None => false,
    }
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
    fn auth_callback_deep_links_are_recognized() {
        assert!(is_auth_callback_deep_link(
            "houston://auth-callback?code=c&state=s"
        ));
        assert!(is_auth_callback_deep_link("houston://auth-callback"));
        assert!(is_auth_callback_deep_link("houston://auth-callback/"));
    }

    #[test]
    fn non_callback_deep_links_are_ignored() {
        assert!(!is_auth_callback_deep_link("houston://open"));
        assert!(!is_auth_callback_deep_link("houston://auth-callbackevil?x=1"));
        assert!(!is_auth_callback_deep_link("https://gethouston.ai/auth-callback"));
    }

    /// Round-trip + permission contract of the Linux fallback file store
    /// (runs on every Unix — the store is dir-parameterized).
    #[cfg(unix)]
    #[test]
    fn file_store_round_trip_and_permissions() {
        use std::os::unix::fs::PermissionsExt;
        let dir = std::env::temp_dir().join(format!("houston-auth-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);

        assert_eq!(file_store::get(&dir, "houston-auth").unwrap(), None);

        file_store::set(&dir, "houston-auth", "blob-1").unwrap();
        assert_eq!(
            file_store::get(&dir, "houston-auth").unwrap().as_deref(),
            Some("blob-1")
        );
        let mode = std::fs::metadata(dir.join("houston-auth.auth"))
            .unwrap()
            .permissions()
            .mode();
        assert_eq!(mode & 0o777, 0o600, "session file must be user-only");

        file_store::set(&dir, "houston-auth", "blob-2").unwrap();
        assert_eq!(
            file_store::get(&dir, "houston-auth").unwrap().as_deref(),
            Some("blob-2")
        );

        file_store::remove(&dir, "houston-auth").unwrap();
        assert_eq!(file_store::get(&dir, "houston-auth").unwrap(), None);
        // Idempotent on missing.
        file_store::remove(&dir, "houston-auth").unwrap();

        let _ = std::fs::remove_dir_all(&dir);
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
}
