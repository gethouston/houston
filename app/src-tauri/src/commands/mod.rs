//! OS-native Tauri commands — everything else is served by the host.

use std::path::{Path, PathBuf};

pub mod diagnostics;
mod dialogs;
pub mod os;
pub mod portable;
pub mod save_file;
pub mod terminal;
pub mod update;

/// Expand a leading `~` to the user's home directory.
///
/// Shell tilde expansion doesn't happen in Rust's `PathBuf`; use this when
/// accepting user-facing paths like `~/Documents/MyApp`. Cross-platform: uses
/// `dirs::home_dir()` rather than `$HOME` so Windows resolves correctly.
/// (Inlined here when the Rust engine crates that previously owned
/// `houston_tauri::paths::expand_tilde` were removed.)
pub(crate) fn expand_tilde(path: &Path) -> PathBuf {
    if path.starts_with("~") {
        if let Some(home) = dirs::home_dir() {
            return home.join(path.strip_prefix("~").unwrap_or(path));
        }
    }
    path.to_path_buf()
}
