//! Houston data root path resolution.
//!
//! Mirrors `houston_db::db::houston_dir` (duplicated because terminal-manager
//! sits below the DB crate in the workspace graph): `HOUSTON_HOME` env wins,
//! otherwise `~/.dev-houston` in debug builds and `~/.houston` in release.

use std::path::PathBuf;

/// Resolve the Houston data root.
pub fn houston_data_root() -> PathBuf {
    if let Ok(override_path) = std::env::var("HOUSTON_HOME") {
        return PathBuf::from(override_path);
    }
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    let subdir = if cfg!(debug_assertions) {
        ".dev-houston"
    } else {
        ".houston"
    };
    home.join(subdir)
}
