//! Bridge credentials fail closed when OS-protected storage is unavailable.
//! Windows uses the existing DPAPI adapter; Unix never uses a plaintext fallback.
#[cfg(target_os = "windows")]
pub async fn get(key: String) -> Result<Option<String>, String> {
    crate::auth::auth_get_item(key).await
}
#[cfg(target_os = "windows")]
pub async fn set(key: String, value: String) -> Result<(), String> {
    crate::auth::auth_set_item(key, value).await
}
#[cfg(target_os = "windows")]
pub async fn remove(key: String) -> Result<(), String> {
    crate::auth::auth_remove_item(key).await
}
#[cfg(not(target_os = "windows"))]
fn entry(key: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new("com.houston.app.local-bridge", key)
        .map_err(|_| "Secure bridge storage is unavailable".into())
}
#[cfg(not(target_os = "windows"))]
pub async fn get(key: String) -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(move || match entry(&key)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("Cannot read secure bridge credentials".into()),
    })
    .await
    .map_err(|_| "Secure bridge storage task failed")?
}
#[cfg(not(target_os = "windows"))]
pub async fn set(key: String, value: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        entry(&key)?
            .set_password(&value)
            .map_err(|_| "Cannot save secure bridge credentials".into())
    })
    .await
    .map_err(|_| "Secure bridge storage task failed")?
}
#[cfg(not(target_os = "windows"))]
pub async fn remove(key: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || match entry(&key)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("Cannot remove secure bridge credentials".into()),
    })
    .await
    .map_err(|_| "Secure bridge storage task failed")?
}
