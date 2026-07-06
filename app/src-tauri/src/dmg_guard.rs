//! First-launch DMG guard (macOS only — LetsMove pattern).
//!
//! When the user double-clicks `Houston.app` *inside the mounted DMG* (a
//! common mistake — they think they've "installed" it just by opening
//! the DMG and double-clicking the icon), the app would otherwise launch
//! from `/Volumes/Houston Installer/Houston.app`. Workspaces, databases,
//! and Keychain entries get tied to a read-only volume that disappears
//! as soon as Finder ejects it. Confusing failure mode for non-technical
//! users — many of ours, per the project memory.
//!
//! This guard fires BEFORE the Tauri builder runs. If `current_exe()`
//! lives under `/Volumes/`, we show a native AppKit dialog (rfd) asking
//! the user to move the app to /Applications. On confirm we `cp -R` the
//! bundle, launch the moved copy via `/usr/bin/open`, and `exit(0)` the
//! current process so the user never sees the in-DMG instance run.
//!
//! Dev / debug builds also respond to `HOUSTON_FORCE_DMG_GUARD=1` so the
//! flow can be exercised with `pnpm tauri dev` without producing a DMG.
//! Release builds ignore the env var.
//!
//! No-op on Windows / Linux — the guard module is only compiled on macOS
//! (see `lib.rs#[cfg(target_os = "macos")]`).

use std::path::{Path, PathBuf};
use std::process::Command;

/// Walk up from the running executable to the enclosing `.app` bundle.
/// Returns `None` if we're not inside a bundle (e.g. `cargo run` in dev).
fn enclosing_app_bundle(exe: &Path) -> Option<PathBuf> {
    let mut p = exe.to_path_buf();
    while let Some(parent) = p.parent() {
        if parent
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| s.eq_ignore_ascii_case("app"))
            .unwrap_or(false)
        {
            return Some(parent.to_path_buf());
        }
        p = parent.to_path_buf();
    }
    None
}

/// True if `app_path` lives inside a mounted disk image. Finder mounts
/// every DMG under `/Volumes/<volume-name>/`, so `starts_with("/Volumes/")`
/// is the canonical check. We deliberately do NOT try to detect "is this
/// volume read-only" — translocation (Gatekeeper quarantine) can also
/// produce a read-only path and we want to handle both.
pub fn is_running_from_dmg(app_path: &Path) -> bool {
    app_path.starts_with("/Volumes/")
}

/// Decide whether the guard should run on this launch.
///
/// In release builds we only run if `current_exe()` resolves to a path
/// under `/Volumes/`. In debug builds the same check applies, but we
/// also honour `HOUSTON_FORCE_DMG_GUARD=1` so the dialog flow can be
/// tested with `pnpm tauri dev` without building + mounting a DMG.
pub fn should_run() -> bool {
    if cfg!(debug_assertions) && std::env::var("HOUSTON_FORCE_DMG_GUARD").as_deref() == Ok("1") {
        return true;
    }
    let exe = match std::env::current_exe() {
        Ok(p) => p,
        Err(_) => return false,
    };
    let app = match enclosing_app_bundle(&exe) {
        Some(a) => a,
        None => return false,
    };
    is_running_from_dmg(&app)
}

/// Show the move-to-Applications dialog. Returns the user's choice.
enum Choice {
    Move,
    Quit,
}

fn show_move_dialog() -> Choice {
    let result = rfd::MessageDialog::new()
        .set_level(rfd::MessageLevel::Info)
        .set_title("Move Houston to your Applications folder")
        .set_description(
            "Houston is currently running from the installer disk image. To use it normally, \
             move it to your Applications folder.\n\n\
             Click Move to do this automatically. Then open Houston from Applications.",
        )
        .set_buttons(rfd::MessageButtons::OkCancelCustom(
            "Move to Applications".into(),
            "Quit".into(),
        ))
        .show();
    match result {
        rfd::MessageDialogResult::Custom(s) if s == "Move to Applications" => Choice::Move,
        rfd::MessageDialogResult::Ok => Choice::Move,
        _ => Choice::Quit,
    }
}

fn show_error(title: &str, body: &str) {
    rfd::MessageDialog::new()
        .set_level(rfd::MessageLevel::Error)
        .set_title(title)
        .set_description(body)
        .set_buttons(rfd::MessageButtons::Ok)
        .show();
}

fn show_already_installed_and_running() {
    rfd::MessageDialog::new()
        .set_level(rfd::MessageLevel::Warning)
        .set_title("Houston is already running")
        .set_description(
            "Houston is already installed in your Applications folder and currently running. \
             Quit the running copy first, then drag Houston from this disk image into Applications.",
        )
        .set_buttons(rfd::MessageButtons::Ok)
        .show();
}

/// True if there's a Houston process running with `/Applications/Houston.app` in its path.
/// Best-effort — we shell out to `pgrep` because there's no portable Rust API for this.
fn is_installed_copy_running() -> bool {
    Command::new("/usr/bin/pgrep")
        .args(["-f", "/Applications/Houston.app/Contents/MacOS/"])
        .output()
        .map(|o| o.status.success() && !o.stdout.is_empty())
        .unwrap_or(false)
}

/// Copy the source `.app` bundle into `/Applications/Houston.app`,
/// replacing any existing copy. Returns the destination path on success.
fn copy_to_applications(source_app: &Path) -> Result<PathBuf, String> {
    let dest = PathBuf::from("/Applications/Houston.app");

    if dest.exists() {
        if is_installed_copy_running() {
            return Err("running".into());
        }
        // `rm -rf` is safe here: dest is a hardcoded path to a specific
        // .app bundle, not a user-supplied value. The alternative (Rust
        // recursive remove) fails on signed bundles whose `Contents/_CodeSignature`
        // has restrictive perms; the shell tool handles it correctly.
        let rm = Command::new("/bin/rm")
            .args(["-rf", "/Applications/Houston.app"])
            .status()
            .map_err(|e| format!("failed to invoke /bin/rm: {e}"))?;
        if !rm.success() {
            return Err(format!("rm -rf /Applications/Houston.app exited with {rm}"));
        }
    }

    let cp = Command::new("/bin/cp")
        .arg("-R")
        .arg(source_app)
        .arg(&dest)
        .status()
        .map_err(|e| format!("failed to invoke /bin/cp: {e}"))?;
    if !cp.success() {
        return Err(format!("cp -R exited with {cp}"));
    }
    Ok(dest)
}

fn launch_app(path: &Path) -> Result<(), String> {
    Command::new("/usr/bin/open")
        .arg(path)
        .status()
        .map_err(|e| format!("failed to invoke /usr/bin/open: {e}"))?;
    Ok(())
}

/// Main entry. Returns only if the guard decided to let this launch
/// continue (i.e. we're not in a DMG, or — in debug — the user cancelled
/// the forced dialog). On the LetsMove happy path we `exit(0)` after
/// launching the installed copy; on hard failure we `exit(1)` with a
/// surfaced error.
pub fn handle_if_needed() {
    if !should_run() {
        return;
    }

    // In debug mode with the force flag, we have no real DMG to copy
    // from — just show the dialog so the wording can be reviewed, then
    // let the launch continue regardless of the user's choice.
    let forced_debug =
        cfg!(debug_assertions) && std::env::var("HOUSTON_FORCE_DMG_GUARD").as_deref() == Ok("1");

    let exe = match std::env::current_exe() {
        Ok(p) => p,
        Err(e) => {
            tracing::error!("[dmg-guard] current_exe failed: {e}");
            return;
        }
    };
    let source_app = match enclosing_app_bundle(&exe) {
        Some(a) => a,
        None => {
            if forced_debug {
                // Dev preview: show the dialog with a fake source so the
                // user can verify the copy + branding. Quit after.
                let _ = show_move_dialog();
                return;
            }
            return;
        }
    };

    match show_move_dialog() {
        Choice::Quit => {
            std::process::exit(0);
        }
        Choice::Move => {
            if forced_debug {
                // Don't actually clobber /Applications/Houston.app in dev.
                tracing::info!("[dmg-guard] forced-debug Move clicked — skipping real copy");
                return;
            }
            match copy_to_applications(&source_app) {
                Ok(dest) => {
                    if let Err(e) = launch_app(&dest) {
                        show_error(
                            "Couldn't launch Houston from Applications",
                            &format!(
                                "Houston was copied to /Applications but failed to launch. \
                                 Please open it from your Applications folder.\n\nDetails: {e}"
                            ),
                        );
                        std::process::exit(1);
                    }
                    std::process::exit(0);
                }
                Err(err) if err == "running" => {
                    show_already_installed_and_running();
                    std::process::exit(0);
                }
                Err(err) => {
                    show_error(
                        "Couldn't move Houston to Applications",
                        &format!(
                            "Houston couldn't copy itself to your Applications folder. \
                             Please drag the Houston icon onto the Applications shortcut in the disk image instead.\n\n\
                             Details: {err}"
                        ),
                    );
                    std::process::exit(1);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn dmg_path_detected() {
        assert!(is_running_from_dmg(&PathBuf::from(
            "/Volumes/Houston Installer/Houston.app"
        )));
    }

    #[test]
    fn applications_path_not_dmg() {
        assert!(!is_running_from_dmg(&PathBuf::from(
            "/Applications/Houston.app"
        )));
    }

    #[test]
    fn user_home_not_dmg() {
        assert!(!is_running_from_dmg(&PathBuf::from(
            "/Users/foo/Downloads/Houston.app"
        )));
    }

    #[test]
    fn finds_enclosing_app() {
        let exe =
            PathBuf::from("/Volumes/Houston Installer/Houston.app/Contents/MacOS/houston-app");
        assert_eq!(
            enclosing_app_bundle(&exe),
            Some(PathBuf::from("/Volumes/Houston Installer/Houston.app"))
        );
    }

    #[test]
    fn no_enclosing_app_outside_bundle() {
        let exe = PathBuf::from("/Users/foo/target/debug/houston-app");
        assert_eq!(enclosing_app_bundle(&exe), None);
    }
}
