//! Heal blank Houston icons on Windows (PRODUCT-1233).
//!
//! Every Houston release is a WiX MajorUpgrade: the MSI ProductCode changes
//! and Windows deletes the old `C:\Windows\Installer\<ProductCode>\` folder —
//! the exact folder the Start Menu shortcut's MSI icon used to live in. Any
//! taskbar pin the user made from that shortcut keeps the dead icon path
//! forever, so after a background update the pin degrades to the blank
//! default icon. The vendored WiX template (`wix/main.wxs`) stops NEW
//! shortcuts from referencing the installer icon cache; this module repairs
//! installs pinned before the fix, and refreshes the shell icon cache to heal
//! desktop icons that were blanked while the updater had `Houston.exe`
//! removed mid-upgrade.
//!
//! Once per installed version (i.e. on the first launch after every update —
//! the only moment breakage can occur), a background thread:
//!   1. rewrites the icon location of any user `.lnk` (taskbar pins, desktop)
//!      that targets this exe but points at a missing icon file or into
//!      `C:\Windows\Installer\`, so it uses the exe's own embedded icon;
//!   2. runs `ie4uinit.exe -show` to make Explorer re-resolve cached icons.
//!
//! Failures are logged (this is unprompted background repair, not a
//! user-initiated action — same policy as the runtime deep-link
//! registration in `lib.rs`).

/// Marker file (under `houston_dir()`) recording the last app version that
/// completed the repair pass, so the pass runs once per installed version.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
const MARKER_FILE: &str = ".windows-icon-repair-version";

/// Whether the repair pass should run: only when the marker doesn't record
/// the current version yet.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn should_run(marker: Option<&str>, current_version: &str) -> bool {
    marker.map(str::trim) != Some(current_version.trim())
}

/// Escape a string for a single-quoted PowerShell literal.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn ps_single_quoted(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

/// Build the PowerShell repair script. Scans the user's taskbar-pin folder
/// and desktop for `.lnk` files targeting `exe_path` whose icon reference is
/// dead or lives in the per-ProductCode installer icon cache, and repoints
/// them at the exe itself. Per-shortcut failures are swallowed so one odd
/// `.lnk` can't abort the sweep; a top-level failure exits non-zero.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn repair_script(exe_path: &str) -> String {
    format!(
        r#"$exe = {exe}
$dirs = @(
  (Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar'),
  [Environment]::GetFolderPath('Desktop')
)
$shell = New-Object -ComObject WScript.Shell
$installerCache = Join-Path $env:windir 'Installer'
foreach ($dir in $dirs) {{
  if (-not $dir -or -not (Test-Path -LiteralPath $dir)) {{ continue }}
  foreach ($file in Get-ChildItem -LiteralPath $dir -Filter '*.lnk' -File -ErrorAction SilentlyContinue) {{
    try {{
      $lnk = $shell.CreateShortcut($file.FullName)
      if (-not $lnk.TargetPath -or ($lnk.TargetPath -ine $exe)) {{ continue }}
      $icon = ($lnk.IconLocation -split ',')[0].Trim()
      if (-not $icon -or ($icon -ieq $exe)) {{ continue }}
      $dead = -not (Test-Path -LiteralPath $icon)
      $cached = $icon.StartsWith($installerCache, [System.StringComparison]::OrdinalIgnoreCase)
      if ($dead -or $cached) {{
        $lnk.IconLocation = "$exe,0"
        $lnk.Save()
      }}
    }} catch {{}}
  }}
}}"#,
        exe = ps_single_quoted(exe_path)
    )
}

/// Spawn the once-per-version repair pass on a background thread.
#[cfg(target_os = "windows")]
pub fn spawn_repair(version: String) {
    std::thread::spawn(move || {
        let marker_path = crate::houston_dir().join(MARKER_FILE);
        let marker = std::fs::read_to_string(&marker_path).ok();
        if !should_run(marker.as_deref(), &version) {
            return;
        }
        match run_repair() {
            Ok(()) => {
                tracing::info!("[icon-repair] shortcut icons repaired for v{version}");
                // houston_dir() may not exist yet on a fresh install (the
                // host creates it on boot, possibly after this thread runs).
                let write = std::fs::create_dir_all(marker_path.parent().unwrap_or(&marker_path))
                    .and_then(|()| std::fs::write(&marker_path, &version));
                if let Err(e) = write {
                    // Next launch retries the (idempotent) pass.
                    tracing::warn!("[icon-repair] marker write failed: {e}");
                }
            }
            Err(e) => tracing::warn!("[icon-repair] repair pass failed: {e}"),
        }
    });
}

/// Run the `.lnk` sweep, then refresh Explorer's icon cache.
#[cfg(target_os = "windows")]
fn run_repair() -> Result<(), String> {
    use base64::Engine as _;
    use std::os::windows::process::CommandExt;
    use std::path::Path;

    // Keep the spawned consoles invisible (PROCESS_CREATION_FLAGS value).
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let exe = std::env::current_exe().map_err(|e| format!("current_exe: {e}"))?;
    // System32-as-cwd breaks PowerShell child spawns (see shell_env notes);
    // anchor both children at the install dir instead.
    let cwd = exe
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "exe has no parent dir".to_string())?;

    // -EncodedCommand (base64 UTF-16LE) dodges Windows argv re-quoting.
    let script = repair_script(&exe.to_string_lossy());
    let utf16: Vec<u8> = script
        .encode_utf16()
        .flat_map(|unit| unit.to_le_bytes())
        .collect();
    let encoded = base64::engine::general_purpose::STANDARD.encode(utf16);

    let sweep = std::process::Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-EncodedCommand", &encoded])
        .current_dir(&cwd)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("powershell spawn: {e}"))?;
    if !sweep.status.success() {
        return Err(format!(
            "lnk sweep exited {}: {}",
            sweep.status,
            String::from_utf8_lossy(&sweep.stderr)
        ));
    }

    // `-show` re-resolves cached shell icons in place (the same refresh
    // Squirrel/Electron run after their updates).
    let refresh = std::process::Command::new("ie4uinit.exe")
        .arg("-show")
        .current_dir(&cwd)
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .map_err(|e| format!("ie4uinit spawn: {e}"))?;
    if !refresh.success() {
        return Err(format!("ie4uinit -show exited {refresh}"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runs_when_marker_missing_or_stale() {
        assert!(should_run(None, "0.6.0"));
        assert!(should_run(Some("0.5.9"), "0.6.0"));
        assert!(should_run(Some(""), "0.6.0"));
    }

    #[test]
    fn skips_when_marker_matches_current_version() {
        assert!(!should_run(Some("0.6.0"), "0.6.0"));
        // Tolerates the trailing newline an edited marker might carry.
        assert!(!should_run(Some("0.6.0\n"), "0.6.0"));
    }

    #[test]
    fn ps_single_quoted_escapes_embedded_quotes() {
        assert_eq!(ps_single_quoted("plain"), "'plain'");
        assert_eq!(
            ps_single_quoted(r"C:\Users\O'Brien\Houston.exe"),
            r"'C:\Users\O''Brien\Houston.exe'"
        );
    }

    #[test]
    fn repair_script_embeds_exe_and_targets_pins_and_desktop() {
        let script = repair_script(r"C:\Program Files\Houston\Houston.exe");
        assert!(script.contains(r"$exe = 'C:\Program Files\Houston\Houston.exe'"));
        assert!(script.contains(r"User Pinned\TaskBar"));
        assert!(script.contains("GetFolderPath('Desktop')"));
        // Only rewrites icons that are dead or in the installer icon cache.
        assert!(script.contains("$dead -or $cached"));
        // Never retargets the shortcut itself, only its icon.
        assert!(script.contains(r#"$lnk.IconLocation = "$exe,0""#));
        assert!(!script.contains("TargetPath ="));
    }
}
