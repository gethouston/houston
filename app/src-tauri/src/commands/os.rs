//! OS-native commands — kept in the Tauri adapter because they only make
//! sense on the user's local machine.
//!
//! The engine may run on a remote VPS for Houston Always On / Teams /
//! Cloud; these commands (folder picker, Finder reveal, URL open, terminal
//! launch, local CLI probes) would be meaningless there and stay
//! desktop-only.

use std::path::{Path, PathBuf};
use tokio::process::Command;

fn shell_command_exists(bin: &str) -> bool {
    let probe = if cfg!(windows) { "where" } else { "which" };
    std::process::Command::new(probe)
        .arg(bin)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Does the user's shell have the `claude` CLI on `PATH`?
#[tauri::command]
pub fn check_claude_cli() -> bool {
    shell_command_exists("claude")
}

fn expand(p: &str) -> PathBuf {
    houston_tauri::paths::expand_tilde(&PathBuf::from(p))
}

// -- Directory Picker --

#[tauri::command(rename_all = "snake_case")]
pub async fn pick_directory() -> Result<Option<String>, String> {
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("osascript")
            .arg("-e")
            .arg(r#"POSIX path of (choose folder with prompt "Select your project directory")"#)
            .output()
            .await
            .map_err(|e| format!("Failed to open folder picker: {e}"))?;

        if !output.status.success() {
            return Ok(None);
        }

        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if path.is_empty() {
            return Ok(None);
        }
        Ok(Some(path))
    }
    #[cfg(target_os = "windows")]
    {
        // PowerShell's FolderBrowserDialog is the closest stdlib-only
        // equivalent on Windows. STA threading is required for COM
        // dialogs; -Sta makes that explicit.
        let script = r#"
Add-Type -AssemblyName System.Windows.Forms | Out-Null
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = 'Select your project directory'
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output $dialog.SelectedPath
}
"#;
        let output = Command::new("powershell")
            .args(["-NoProfile", "-Sta", "-Command", script])
            .output()
            .await
            .map_err(|e| format!("Failed to open folder picker: {e}"))?;

        if !output.status.success() {
            return Ok(None);
        }
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if path.is_empty() {
            return Ok(None);
        }
        Ok(Some(path))
    }
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        // Linux: zenity is the lowest-common-denominator GTK picker.
        let output = Command::new("zenity")
            .args(["--file-selection", "--directory", "--title=Select your project directory"])
            .output()
            .await
            .map_err(|e| format!("Failed to open folder picker (install zenity): {e}"))?;

        if !output.status.success() {
            return Ok(None);
        }
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if path.is_empty() {
            return Ok(None);
        }
        Ok(Some(path))
    }
}

// -- Open a URL in the default browser --

/// Spawn the OS-native "open this in the default app" command. Path-or-URL
/// flavor — caller passes either a URL or a filesystem path; on every
/// platform the same shell verb opens both.
fn spawn_default_open(target: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(target)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("Failed to open: {e}"))
    }
    #[cfg(target_os = "windows")]
    {
        // `cmd /C start "" "<target>"` is the canonical way to invoke the
        // Windows shell handler. The empty `""` is the *window title* arg
        // — without it `start` treats a quoted target as the title and
        // opens nothing.
        std::process::Command::new("cmd")
            .args(["/C", "start", "", target])
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("Failed to open: {e}"))
    }
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        std::process::Command::new("xdg-open")
            .arg(target)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("Failed to open (install xdg-utils): {e}"))
    }
}

#[tauri::command(rename_all = "snake_case")]
pub async fn open_url(url: String) -> Result<(), String> {
    spawn_default_open(&url).map_err(|e| format!("Failed to open URL: {e}"))
}

// -- File reveal / open --

#[tauri::command(rename_all = "snake_case")]
pub async fn open_file(agent_path: String, relative_path: String) -> Result<(), String> {
    let root = expand(&agent_path);
    let full = root.join(&relative_path);
    if !full.exists() {
        return Err(format!("File does not exist: {}", full.display()));
    }
    // Relative paths arrive forward-slash per the engine's ProjectFile.path
    // contract, and Path::join keeps them when appended to a backslash agent
    // root. Some Windows shell handlers (notably Office) reject the mixed
    // form, so normalize before handing off to `cmd /C start`.
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
    spawn_default_open(&root.to_string_lossy())
        .map_err(|e| format!("Failed to open folder: {e}"))
}

/// Open the OS file manager with the given path selected (Finder reveal /
/// Explorer /select / xdg-open on parent dir).
fn reveal_in_file_manager(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(path)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(target_os = "windows")]
    {
        // explorer.exe /select,<path> opens the parent folder with the
        // file highlighted. Two Windows quirks to handle:
        //   1. Explorer refuses mixed separators. Relative paths arrive
        //      forward-slash per the engine's ProjectFile.path contract,
        //      and Path::join keeps them when appended to a backslash
        //      agent root, so the joined string is mixed. Normalize to \.
        //   2. Command::arg auto-wraps any arg containing spaces in double
        //      quotes on Windows. Explorer can't parse `"/select,...` —
        //      the leading quote makes it ignore the verb and open the
        //      default folder (Documents). Use raw_arg so the cmdline goes
        //      out exactly as `/select,C:\path with space\file.txt`.
        use std::os::windows::process::CommandExt;
        let native = path.to_string_lossy().replace('/', "\\");
        let select_arg = format!("/select,{native}");
        std::process::Command::new("explorer")
            .raw_arg(&select_arg)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        // No portable "select" verb on Linux — fall back to opening the
        // parent directory. Better than failing.
        let parent = path.parent().unwrap_or(path);
        std::process::Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
}
