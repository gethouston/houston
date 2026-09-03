//! Validation of an inherited `CLAUDE_CODE_GIT_BASH_PATH` override.
//!
//! The Claude Code CLI honors that env var verbatim and refuses to start when
//! it does not name a usable bash (HOUSTON-APP-4ZP: `unable to find
//! CLAUDE_CODE_GIT_BASH_PATH path ".../WindowsApps/bash.exe"`). A value the
//! app inherits from the user's environment can be stale in ways a plain
//! "does the file exist" probe cannot see:
//!
//! * `%LOCALAPPDATA%\Microsoft\WindowsApps\bash.exe` is the Windows
//!   app-execution alias for WSL — a reparse-point stub that `is_file()`
//!   accepts, but it is not Git Bash and the CLI rejects it.
//! * `%SystemRoot%\System32\bash.exe` (and its `Sysnative` twin) is the
//!   classic WSL launcher, equally wrong.
//! * Any other reparse point (app alias, dangling junction) may resolve for
//!   us and fail for the CLI's own probe.
//!
//! Path-shape logic is pure so it is unit-tested on every host; the
//! filesystem probe is Windows-only.

use std::path::Path;

/// Path components (case-insensitive) under which a `bash.exe` is a WSL
/// launcher rather than Git for Windows.
const WSL_BASH_DIRS: [&str; 3] = ["windowsapps", "system32", "sysnative"];

/// True when `path` names a WSL `bash.exe` (a Windows app-execution alias or
/// the System32 launcher). Pure string logic over the path shape; both `\`
/// and `/` separators are accepted, comparison is case-insensitive.
pub fn is_wsl_bash_alias(path: &str) -> bool {
    let lowered = path.to_ascii_lowercase().replace('/', "\\");
    let mut parts = lowered.rsplit('\\').filter(|p| !p.is_empty());
    let Some(file) = parts.next() else {
        return false;
    };
    if file != "bash.exe" {
        return false;
    }
    parts.any(|dir| WSL_BASH_DIRS.contains(&dir))
}

/// True when an inherited `CLAUDE_CODE_GIT_BASH_PATH` value is a bash the CLI
/// can actually run: not a WSL alias location, and a REAL file rather than a
/// reparse-point stub. Anything else is stale and must not reach the child.
pub fn is_usable_git_bash_override(value: &str) -> bool {
    if is_wsl_bash_alias(value) {
        return false;
    }
    is_regular_file(Path::new(value))
}

/// A plain file, judged WITHOUT following reparse points: `Path::is_file`
/// follows app-execution aliases (Rust's stat falls back to the unresolved
/// attributes for non-symlink reparse tags), so it says "file" for exactly
/// the WSL stub the CLI cannot run.
fn is_regular_file(path: &Path) -> bool {
    let Ok(meta) = std::fs::symlink_metadata(path) else {
        return false;
    };
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
        if meta.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
            return false;
        }
    }
    meta.is_file()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn windowsapps_alias_is_wsl() {
        // The exact shape from HOUSTON-APP-4ZP.
        assert!(is_wsl_bash_alias(
            "C:\\Users\\u\\AppData\\Local\\Microsoft\\WindowsApps\\bash.exe"
        ));
        // Case and separator variants.
        assert!(is_wsl_bash_alias(
            "c:/users/u/appdata/local/microsoft/WINDOWSAPPS/BASH.EXE"
        ));
    }

    #[test]
    fn system32_launchers_are_wsl() {
        assert!(is_wsl_bash_alias("C:\\Windows\\System32\\bash.exe"));
        assert!(is_wsl_bash_alias("C:\\Windows\\Sysnative\\bash.exe"));
    }

    #[test]
    fn git_for_windows_layouts_are_not_wsl() {
        assert!(!is_wsl_bash_alias("C:\\Program Files\\Git\\bin\\bash.exe"));
        assert!(!is_wsl_bash_alias("C:\\Program Files\\Git\\usr\\bin\\bash.exe"));
        assert!(!is_wsl_bash_alias(
            "C:\\Users\\u\\AppData\\Local\\Programs\\Git\\bin\\bash.exe"
        ));
        // A portable MSYS2 bash is a real bash the CLI can run.
        assert!(!is_wsl_bash_alias("D:\\tools\\msys64\\usr\\bin\\bash.exe"));
    }

    #[test]
    fn non_bash_files_are_never_aliases() {
        assert!(!is_wsl_bash_alias("C:\\Windows\\System32\\cmd.exe"));
        assert!(!is_wsl_bash_alias(""));
        assert!(!is_wsl_bash_alias("bash.exe"));
    }

    #[test]
    fn override_probe_rejects_aliases_and_missing_files() {
        assert!(!is_usable_git_bash_override(
            "C:\\Users\\u\\AppData\\Local\\Microsoft\\WindowsApps\\bash.exe"
        ));
        assert!(!is_usable_git_bash_override("/nonexistent/houston/bash.exe"));
    }

    #[test]
    fn override_probe_accepts_a_real_file_and_rejects_a_symlink() {
        let dir = std::env::temp_dir().join(format!(
            "houston-git-bash-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).expect("mkdir temp");
        let real = dir.join("bash.exe");
        std::fs::write(&real, b"#!/bin/sh\n").expect("write fake bash");
        assert!(is_usable_git_bash_override(real.to_str().expect("utf8 path")));
        // A directory is not a bash binary.
        assert!(!is_usable_git_bash_override(dir.to_str().expect("utf8 path")));
        #[cfg(unix)]
        {
            // A symlink resolves for `is_file` but is judged on its own
            // (unfollowed) metadata here — the same posture that rejects a
            // Windows reparse-point stub.
            let link = dir.join("link-bash.exe");
            std::os::unix::fs::symlink(&real, &link).expect("symlink");
            assert!(!is_usable_git_bash_override(link.to_str().expect("utf8 path")));
        }
        std::fs::remove_dir_all(&dir).expect("cleanup");
    }
}
