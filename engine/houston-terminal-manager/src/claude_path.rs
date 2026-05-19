use std::ffi::OsString;
use std::path::PathBuf;
use std::sync::OnceLock;

/// The user's full login-shell PATH, resolved once at startup.
///
/// On Unix (macOS in particular) a `.app` bundle gets a minimal PATH
/// (`/usr/bin:/bin:/usr/sbin:/sbin`), so we ask the user's login shell
/// for the real one AND check common install locations as fallback.
///
/// On Windows the engine inherits the full user PATH from the process
/// that launched it (Explorer, Task Scheduler, the Tauri app), so the
/// shell-resolution dance isn't needed; we still augment with common
/// install directories in case `claude`/`codex` are installed to user
/// locations that PATH happens not to include.
static SHELL_PATH: OnceLock<Option<OsString>> = OnceLock::new();

/// Common locations where `claude` and related CLIs might be installed.
/// Checked as fallback when shell PATH resolution doesn't find them.
/// `~/.composio` is the install location for Composio's CLI — needed so
/// Houston's spawned agents can use `composio search`/`composio execute`
/// via Bash even when the user's login shell hasn't sourced the PATH
/// modification the Composio installer appends to rc files.
///
/// The `~` is expanded against `dirs::home_dir()` so the same list works
/// on Linux/macOS (expanding to `/Users/x` or `/home/x`) and on Windows
/// (expanding to `C:\Users\x`). The trailing Windows-specific entries
/// cover where `npm.cmd`/`claude.cmd` typically land on a default
/// Node.js install.
#[cfg(unix)]
const COMMON_CLAUDE_DIRS: &[&str] = &[
    "~/.local/bin",
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "~/.cargo/bin",
    "~/.composio",
];

#[cfg(windows)]
const COMMON_CLAUDE_DIRS: &[&str] = &[
    "~\\.cargo\\bin",
    "~\\.composio",
    // `~\.local\bin\` mirrors the Unix convention; some installers
    // (pipx-style, manual user installs) drop `claude.exe` here on
    // Windows even though it's not a Microsoft-blessed location.
    "~\\.local\\bin",
    "~\\AppData\\Roaming\\npm",
    "~\\AppData\\Local\\Programs\\claude",
];

/// Resolve the user's login shell PATH and cache it.
/// Call this once at startup before spawning any CLI processes.
pub fn init() {
    SHELL_PATH.get_or_init(|| {
        // Unix: ask the login shell for PATH (macOS `.app` bundle env is
        // stripped). Windows: start from the inherited process PATH.
        #[cfg(unix)]
        let shell_resolved = resolve_login_shell_path().or_else(resolve_interactive_shell_path);
        #[cfg(not(unix))]
        let shell_resolved: Option<OsString> = None;

        let mut final_path =
            shell_resolved.unwrap_or_else(|| std::env::var_os("PATH").unwrap_or_default());

        // Bundled-CLI directories — codex (single binary) and composio
        // (per-arch directory). These ride inside the signed `.app` so
        // subprocess spawns must be able to resolve them without any
        // user-side shell config (PATH manipulation in `~/.zshrc`,
        // homebrew, nvm, etc.). Returned in priority order; we
        // `prepend_path` so the bundled copies WIN over any same-named
        // binaries from the user's shell — production users get the
        // exact version we shipped + signed, not whatever happens to be
        // first on their PATH.
        for dir in houston_cli_bundle::bundled_path_entries() {
            prepend_path(&mut final_path, &dir);
        }

        // Runtime-installed claude-code lives at a known absolute path
        // (`~/.local/bin/claude` on Unix,
        // `%LOCALAPPDATA%\Programs\claude\claude.exe` on Windows). Prepend
        // its directory so the version Houston pinned + downloaded wins
        // over any older `claude` from npm-global / homebrew / nvm / a
        // prior install that happens to sit earlier in the user's shell
        // PATH. Without this prepend, an older `claude` rejects the
        // `--include-partial-messages` flag and every session dies before
        // producing output. (Direct spawn in `claude_runner` already uses
        // the absolute path; this PATH precedence is defense in depth for
        // any other code that resolves `claude` via PATH.)
        let claude_install_dir = crate::claude_install_path::install_dir();
        if claude_install_dir.is_dir() {
            prepend_path(&mut final_path, &claude_install_dir);
        }

        // Expand `~` against the user home directory using the cross-platform
        // `dirs` resolver (HOME on Unix, USERPROFILE on Windows). Falls back
        // to the raw prefix if home can't be resolved — the directory check
        // will simply fail, and we'll skip it.
        let home: PathBuf = dirs::home_dir().unwrap_or_else(|| PathBuf::from("~"));
        for dir in COMMON_CLAUDE_DIRS {
            let expanded_path = expand_home(dir, &home);
            if expanded_path.is_dir() {
                append_path(&mut final_path, &expanded_path);
            }
        }

        // Also check for nvm-installed node (claude/codex are often installed
        // via npm). Only meaningful on Unix — nvm on Windows is a different
        // layout (nvm-windows uses `%APPDATA%\nvm\v<ver>\`).
        #[cfg(unix)]
        {
            let nvm_dir = home.join(".nvm/versions/node");
            if nvm_dir.is_dir() {
                if let Ok(entries) = std::fs::read_dir(&nvm_dir) {
                    for entry in entries.flatten() {
                        let bin = entry.path().join("bin");
                        let has_cli = bin.join("claude").is_file() || bin.join("codex").is_file();
                        if has_cli {
                            append_path(&mut final_path, &bin);
                            break;
                        }
                    }
                }
            }
        }

        Some(final_path)
    });
}

/// Get the resolved PATH (includes all dirs from the user's shell + common dirs).
/// Falls back to the current process PATH if shell resolution failed.
pub fn shell_path() -> OsString {
    SHELL_PATH
        .get()
        .cloned()
        .flatten()
        .unwrap_or_else(|| std::env::var_os("PATH").unwrap_or_default())
}

/// Check if `claude` is available using the resolved PATH.
pub fn is_claude_available() -> bool {
    is_command_available("claude")
}

/// Check if a command is available using the resolved PATH.
///
/// On Windows we also check `<name>.exe`, `<name>.cmd`, `<name>.bat` — the
/// common extensions that `PATHEXT` covers — so both `claude` (bare) and
/// `claude.cmd` (npm-shim install) resolve.
pub fn is_command_available(command: &str) -> bool {
    let path_val = shell_path();
    let dirs = std::env::split_paths(&path_val);
    for dir in dirs {
        if dir.join(command).is_file() {
            return true;
        }
        #[cfg(windows)]
        {
            for ext in ["exe", "cmd", "bat", "ps1"] {
                if dir.join(format!("{command}.{ext}")).is_file() {
                    return true;
                }
            }
        }
    }
    false
}

/// Prepend `dir` to `base` so it wins over any same-named binary later
/// in PATH. Used for bundled CLIs — the production-shipped version must
/// take precedence over whatever the user has installed via
/// homebrew/npm/nvm. Idempotent: if `dir` is already first, no change;
/// if present elsewhere it's moved to the front.
fn prepend_path(base: &mut OsString, dir: &std::path::Path) {
    let mut parts: Vec<PathBuf> = std::env::split_paths(base).collect();
    // Drop any existing occurrence so we don't double-list.
    parts.retain(|p| p != dir);
    parts.insert(0, dir.to_path_buf());
    if let Ok(joined) = std::env::join_paths(&parts) {
        *base = joined;
    } else {
        tracing::debug!(
            "[claude_path] prepend_path/join_paths failed for {}",
            dir.display()
        );
    }
}

/// Append `dir` to `base` using the platform-appropriate PATH separator
/// (`:` on Unix, `;` on Windows), skipping if already present. Uses
/// `std::env::join_paths` so we never hand-roll separator logic.
fn append_path(base: &mut OsString, dir: &std::path::Path) {
    let dir_str = dir.to_string_lossy();
    let current = base.to_string_lossy();
    if current
        .split(PATH_SEP)
        .any(|segment| segment == dir_str.as_ref())
    {
        return;
    }
    let mut parts: Vec<PathBuf> = std::env::split_paths(base).collect();
    parts.push(dir.to_path_buf());
    match std::env::join_paths(&parts) {
        Ok(joined) => *base = joined,
        Err(e) => {
            tracing::debug!(
                "[claude_path] join_paths failed for {}: {}",
                dir.display(),
                e
            );
        }
    }
}

/// Expand a leading `~` (with either `/` or `\\` separator) against the
/// user home directory. Leaves other paths unchanged.
fn expand_home(dir: &str, home: &std::path::Path) -> PathBuf {
    if let Some(rest) = dir.strip_prefix("~/") {
        return home.join(rest);
    }
    if let Some(rest) = dir.strip_prefix("~\\") {
        return home.join(rest);
    }
    PathBuf::from(dir)
}

#[cfg(unix)]
const PATH_SEP: char = ':';
#[cfg(windows)]
const PATH_SEP: char = ';';

/// Ask the user's login shell for its PATH (reads .zprofile).
#[cfg(unix)]
fn resolve_login_shell_path() -> Option<OsString> {
    for shell in &["/bin/zsh", "/bin/bash"] {
        if let Some(path) = path_from_shell(shell, &["-l", "-c", "echo $PATH"]) {
            return Some(OsString::from(path));
        }
    }
    None
}

/// Ask the user's interactive shell for its PATH (reads .zshrc).
/// This catches cases where PATH is set in .zshrc but not .zprofile.
#[cfg(unix)]
fn resolve_interactive_shell_path() -> Option<OsString> {
    for shell in &["/bin/zsh", "/bin/bash"] {
        if let Some(path) = path_from_shell(shell, &["-i", "-c", "echo $PATH"]) {
            return Some(OsString::from(path));
        }
    }
    None
}

#[cfg(unix)]
fn path_from_shell(shell: &str, args: &[&str]) -> Option<String> {
    let output = std::process::Command::new(shell)
        .args(args)
        .stdin(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .output()
        .ok()?;

    if output.status.success() {
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !path.is_empty() {
            return Some(path);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn expand_home_handles_both_separators() {
        let home = Path::new("/home/alice");
        assert_eq!(expand_home("~/foo/bar", home), home.join("foo/bar"));
        assert_eq!(expand_home("~\\foo\\bar", home), home.join("foo\\bar"));
        assert_eq!(
            expand_home("/etc/passwd", home),
            PathBuf::from("/etc/passwd")
        );
    }

    #[test]
    fn append_path_is_idempotent() {
        let initial = if cfg!(windows) {
            OsString::from("C:\\a;C:\\b")
        } else {
            OsString::from("/a:/b")
        };
        let mut p = initial.clone();
        let existing = if cfg!(windows) {
            PathBuf::from("C:\\a")
        } else {
            PathBuf::from("/a")
        };
        append_path(&mut p, &existing);
        assert_eq!(p, initial);
    }

    #[test]
    fn append_path_uses_platform_separator() {
        let mut p = if cfg!(windows) {
            OsString::from("C:\\a")
        } else {
            OsString::from("/a")
        };
        let new_dir = if cfg!(windows) {
            PathBuf::from("C:\\b")
        } else {
            PathBuf::from("/b")
        };
        append_path(&mut p, &new_dir);
        let expected = if cfg!(windows) {
            OsString::from("C:\\a;C:\\b")
        } else {
            OsString::from("/a:/b")
        };
        assert_eq!(p, expected);
    }

    #[test]
    fn is_command_available_returns_false_for_garbage() {
        // Using a long random name that can't exist anywhere in PATH —
        // keeps the test stable across platforms.
        assert!(!is_command_available(
            "definitely-not-a-real-binary-xyz-zzz-houston-test"
        ));
    }

    #[test]
    fn prepend_path_moves_existing_to_front() {
        let mut p = if cfg!(windows) {
            OsString::from("C:\\a;C:\\b;C:\\c")
        } else {
            OsString::from("/a:/b:/c")
        };
        let middle = if cfg!(windows) {
            PathBuf::from("C:\\b")
        } else {
            PathBuf::from("/b")
        };
        prepend_path(&mut p, &middle);
        let expected = if cfg!(windows) {
            OsString::from("C:\\b;C:\\a;C:\\c")
        } else {
            OsString::from("/b:/a:/c")
        };
        assert_eq!(p, expected);
    }

    #[test]
    fn prepend_path_inserts_new_dir_at_front() {
        let mut p = if cfg!(windows) {
            OsString::from("C:\\a")
        } else {
            OsString::from("/a")
        };
        let new_dir = if cfg!(windows) {
            PathBuf::from("C:\\b")
        } else {
            PathBuf::from("/b")
        };
        prepend_path(&mut p, &new_dir);
        let expected = if cfg!(windows) {
            OsString::from("C:\\b;C:\\a")
        } else {
            OsString::from("/b:/a")
        };
        assert_eq!(p, expected);
    }
}
