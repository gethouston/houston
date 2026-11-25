//! OS-native commands — kept in the Tauri adapter because they only make
//! sense on the user's local machine.
//!
//! The engine may run on a remote VPS for Houston Always On / Teams /
//! Cloud; these commands (file-manager reveal, URL open, local
//! CLI probes) would be meaningless there and stay desktop-only.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

use super::file_failure::FileOpFailure;
use super::url_open_failure::{self, UrlOpenFailure};

fn expand(p: &str) -> PathBuf {
    super::expand_tilde(&PathBuf::from(p))
}

static LAUNCH_T0_MS: OnceLock<u64> = OnceLock::new();

/// Stamp "Houston's own code started" as early as `run()` allows. The webview's
/// `performance.timeOrigin` starts only at webview creation, missing the
/// shell's boot — this stamp is the app-open T0 the perf spans measure from.
/// Idempotent; the first call wins.
pub fn stamp_launch_t0() {
    let _ = LAUNCH_T0_MS.set(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0),
    );
}

#[tauri::command(rename_all = "snake_case")]
pub fn launch_t0_ms() -> Option<u64> {
    LAUNCH_T0_MS.get().copied().filter(|&ms| ms > 0)
}

// WHY: cmd /C start splits URLs at & and expands %VAR%; AppImage env crashes xdg-open's browser. ADR-0105
/// Spawn the OS-native "open this in the default app" command. Path-or-URL
/// flavor — caller passes either a URL or a filesystem path; on every
/// platform the same shell verb opens both. Rejects typed so `open_url` can
/// tell "no program registered for this" from a real fault.
fn spawn_default_open(target: &str) -> Result<(), UrlOpenFailure> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(target)
            .spawn()
            .map(|_| ())
            .map_err(|e| url_open_failure::from_spawn_error("open", &e))
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::UI::Shell::ShellExecuteW;

        const SW_SHOWNORMAL: i32 = 1;

        let wide = |s: &str| -> Vec<u16> {
            std::ffi::OsStr::new(s)
                .encode_wide()
                .chain(std::iter::once(0))
                .collect()
        };
        let verb = wide("open");
        let file = wide(target);

        // SAFETY: `verb` and `file` are null-terminated UTF-16 buffers that
        // outlive the call; the remaining pointers are null (no parent window,
        // no parameters, default working directory).
        let result = unsafe {
            ShellExecuteW(
                std::ptr::null_mut(),
                verb.as_ptr(),
                file.as_ptr(),
                std::ptr::null(),
                std::ptr::null(),
                SW_SHOWNORMAL,
            )
        };
        if (result as isize) <= 32 {
            return Err(url_open_failure::from_shell_execute_code(result as isize));
        }
        Ok(())
    }
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        let mut cmd = std::process::Command::new("xdg-open");
        cmd.arg(target);
        crate::appimage_env::sanitize_std_command(&mut cmd);
        cmd.spawn()
            .map(|_| ())
            .map_err(|e| url_open_failure::from_spawn_error("xdg-open (install xdg-utils)", &e))
    }
}

/// Rejects typed (`UrlOpenFailure`): a machine with no default browser is a
/// `no_handler` state the user fixes in the OS settings (HOUSTON-APP-5ES),
/// not a bug to report.
#[tauri::command(rename_all = "snake_case")]
pub async fn open_url(url: String) -> Result<(), UrlOpenFailure> {
    spawn_default_open(&url).map_err(|e| e.context("Failed to open URL"))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn open_file(agent_path: String, relative_path: String) -> Result<(), String> {
    let root = expand(&agent_path);
    let full = root.join(&relative_path);
    if !full.exists() {
        return Err(format!("File does not exist: {}", full.display()));
    }
    let target = full.to_string_lossy();
    #[cfg(target_os = "windows")]
    let target = target.replace('/', "\\");
    spawn_default_open(&target).map_err(|e| format!("Failed to open file: {e}"))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn reveal_file(agent_path: String, relative_path: String) -> Result<(), String> {
    let root = expand(&agent_path);
    let full = root.join(&relative_path);
    if !full.exists() {
        return Err(format!("File does not exist: {}", full.display()));
    }
    reveal_in_file_manager(&full).map_err(|e| format!("Failed to reveal file: {e}"))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn reveal_agent(agent_path: String) -> Result<(), String> {
    let root = expand(&agent_path);
    spawn_default_open(&root.to_string_lossy()).map_err(|e| format!("Failed to open folder: {e}"))
}

/// Reveal an arbitrary absolute path in the OS file manager. Used by flows
/// that produce a file outside any agent root (e.g. the portable-agent
/// exporter writes a `.houstonagent` wherever the user picked in the save
/// dialog — Desktop, Downloads, USB drive, …).
///
/// Rejects typed (`file_failure`): Explorer refusing to launch ("Access is
/// denied. (os error 5)", HOUSTON-APP-5C6) is a `permission` state the user
/// can work around, not a bug to report (PRODUCT-1732).
#[tauri::command(rename_all = "snake_case")]
pub async fn reveal_path(path: String) -> Result<(), FileOpFailure> {
    let target = expand(&path);
    if !target.exists() {
        return Err(FileOpFailure::other(format!(
            "Path does not exist: {}",
            target.display()
        )));
    }
    reveal_in_file_manager(&target).map_err(|e| FileOpFailure::from_io("Failed to reveal path", &e))
}

/// Open the OS file manager with the given path selected (Finder reveal /
/// Explorer /select / xdg-open on parent dir).
fn reveal_in_file_manager(path: &Path) -> Result<(), std::io::Error> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(path)
            .spawn()
            .map(|_| ())
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let native = path.to_string_lossy().replace('/', "\\");
        let select_arg = format!("/select,{native}");
        let spawned = std::process::Command::new("explorer")
            .raw_arg(&select_arg)
            .spawn()
            .map(|_| ());
        let Err(spawn_err) = spawned else {
            return Ok(());
        };
        let parent = path
            .parent()
            .unwrap_or(path)
            .to_string_lossy()
            .replace('/', "\\");
        match spawn_default_open(&parent) {
            Ok(()) => Ok(()),
            Err(_) => Err(spawn_err),
        }
    }
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        let parent = path.parent().unwrap_or(path);
        let mut cmd = std::process::Command::new("xdg-open");
        cmd.arg(parent);
        crate::appimage_env::sanitize_std_command(&mut cmd);
        cmd.spawn().map(|_| ())
    }
}
