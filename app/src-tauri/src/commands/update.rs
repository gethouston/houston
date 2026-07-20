//! OS-native app update helpers.
//!
//! On macOS the updater replaces the `.app` bundle while the old process is
//! still alive. Generic process relaunch can resolve to the moved backup
//! bundle, so the frontend captures the original app path before install and
//! asks this module to open that path after install.

use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;

/// The CLOUD channel's rolling updater manifest (kept current by
/// cloud-updater-manifest.yml on every published cloud-v* release). The
/// local build's baked endpoint is the LOCAL feed (latest.json); migration
/// deliberately crosses channels, so the endpoint is overridden here — the
/// JS `check()` cannot do that (no `endpoints` in CheckOptions).
const CLOUD_MANIFEST_URL: &str =
    "https://github.com/gethouston/houston/releases/download/cloud-latest/latest-cloud.json";

/// Remote migration policy: `{"mode":"optional"}` or `{"mode":"required"}`.
/// Lives as an asset on the fixed `migration-policy` release so the mode can
/// be flipped later with one `gh release upload --clobber` — this is the LAST
/// local-channel build, so any future behavior change must ride a remote
/// value baked in today. Absent/unreachable/malformed ⇒ optional (fail-open).
const MIGRATION_POLICY_URL: &str =
    "https://github.com/gethouston/houston/releases/download/migration-policy/migration-policy.json";

/// Progress channel for the cloud-migration download (mirrors
/// `dictation-model-progress`).
const MIGRATION_PROGRESS_EVENT: &str = "cloud-migration-progress";

#[derive(Clone, serde::Serialize)]
struct MigrationProgress {
    downloaded: u64,
    total: Option<u64>,
}

/// Download and install the CLOUD build over this local install, using the
/// updater plugin against the cloud manifest. The version comparator is
/// forced to `true`: the two channels are versioned independently, and this
/// final local release intentionally sits BELOW the cloud line (0.4.x) so
/// the Windows MSI upgrade guard also allows the switch. Signature
/// verification still applies — the builder inherits the tauri.conf pubkey,
/// which is shared by both channels.
#[tauri::command(rename_all = "snake_case")]
pub async fn install_cloud_migration(app: AppHandle) -> Result<(), String> {
    let url = tauri::Url::parse(CLOUD_MANIFEST_URL).map_err(|e| e.to_string())?;
    let updater = app
        .updater_builder()
        .endpoints(vec![url])
        .map_err(|e| format!("cloud migration: endpoint rejected: {e}"))?
        .version_comparator(|_current, _remote| true)
        .build()
        .map_err(|e| format!("cloud migration: updater build failed: {e}"))?;

    let update = updater
        .check()
        .await
        .map_err(|e| format!("cloud migration: manifest check failed: {e}"))?
        .ok_or_else(|| "cloud migration: no cloud build available".to_string())?;

    let mut downloaded: u64 = 0;
    let progress_app = app.clone();
    update
        .download_and_install(
            move |chunk, total| {
                downloaded += chunk as u64;
                let _ = progress_app.emit(
                    MIGRATION_PROGRESS_EVENT,
                    MigrationProgress { downloaded, total },
                );
            },
            || {},
        )
        .await
        .map_err(|e| format!("cloud migration: install failed: {e}"))?;
    Ok(())
}

/// Fetch the remote migration policy mode. Always resolves — every failure
/// path degrades to "optional" so a network outage can never lock a user
/// into a forced migration they can't evaluate.
#[tauri::command(rename_all = "snake_case")]
pub async fn fetch_migration_policy() -> Result<String, String> {
    let mode = async {
        let resp = reqwest::Client::new()
            .get(MIGRATION_POLICY_URL)
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .await
            .ok()?;
        if !resp.status().is_success() {
            return None;
        }
        let body: serde_json::Value = resp.json().await.ok()?;
        match body.get("mode")?.as_str()? {
            "required" => Some("required".to_string()),
            _ => Some("optional".to_string()),
        }
    }
    .await;
    Ok(mode.unwrap_or_else(|| "optional".to_string()))
}

#[tauri::command(rename_all = "snake_case")]
pub fn current_app_bundle_path() -> Result<String, String> {
    let exe = std::env::current_exe()
        .map_err(|e| format!("Failed to resolve current executable: {e}"))?;
    Ok(app_path_from_exe(&exe).display().to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub fn relaunch_app_from_path(app_path: String) -> Result<(), String> {
    let path = PathBuf::from(app_path);
    if !path.exists() {
        return Err(format!("App path does not exist: {}", path.display()));
    }

    launch_app(&path)?;
    std::process::exit(0);
}

fn app_path_from_exe(exe: &Path) -> PathBuf {
    #[cfg(target_os = "macos")]
    if let Some(bundle) = macos_bundle_path_from_exe(exe) {
        return bundle;
    }

    exe.to_path_buf()
}

#[cfg(target_os = "macos")]
fn macos_bundle_path_from_exe(exe: &Path) -> Option<PathBuf> {
    let macos_dir = exe.parent()?;
    if macos_dir.file_name()? != "MacOS" {
        return None;
    }

    let contents_dir = macos_dir.parent()?;
    if contents_dir.file_name()? != "Contents" {
        return None;
    }

    contents_dir.parent().map(PathBuf::from)
}

#[cfg(target_os = "macos")]
fn launch_app(path: &Path) -> Result<(), String> {
    std::process::Command::new("open")
        .arg("-n")
        .arg(path)
        .spawn()
        .map_err(|e| format!("Failed to relaunch Houston: {e}"))?;
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn launch_app(path: &Path) -> Result<(), String> {
    std::process::Command::new(path)
        .spawn()
        .map_err(|e| format!("Failed to relaunch Houston: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::app_path_from_exe;
    use std::path::PathBuf;

    #[test]
    #[cfg(target_os = "macos")]
    fn resolves_macos_bundle_from_executable_path() {
        let exe = PathBuf::from("/Applications/Houston.app/Contents/MacOS/Houston");
        assert_eq!(
            app_path_from_exe(&exe),
            PathBuf::from("/Applications/Houston.app")
        );
    }

    #[test]
    #[cfg(not(target_os = "macos"))]
    fn uses_executable_path_off_macos() {
        let exe = PathBuf::from("/opt/houston/houston");
        assert_eq!(app_path_from_exe(&exe), exe);
    }
}
