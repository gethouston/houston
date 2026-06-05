//! Houston app-level configuration persisted at `~/.houston/app-config.json`.
//!
//! Read by the Tauri boot BEFORE the engine subprocess is spawned, so the
//! user's chosen workspace-root location (`docsRoot`) can be injected as
//! `HOUSTON_DOCS`. Absent or empty `docsRoot` keeps the historical default
//! (`<home>/workspaces`, i.e. `~/.houston/workspaces/`), so existing installs
//! behave exactly as before until the user opts into a visible, git-backed
//! root via onboarding.

use serde::{Deserialize, Serialize};
use std::io;
use std::path::{Path, PathBuf};

const FILE_NAME: &str = "app-config.json";

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    /// Absolute (or `~`-prefixed) path the user chose as their visible,
    /// git-backed Houston root. `None`/empty → default `<home>/workspaces`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub docs_root: Option<String>,
}

fn config_path(houston: &Path) -> PathBuf {
    houston.join(FILE_NAME)
}

fn expand_tilde(path: &str) -> PathBuf {
    if let Some(rest) = path.strip_prefix('~') {
        if let Some(home) = dirs::home_dir() {
            let rest = rest.strip_prefix('/').unwrap_or(rest);
            return if rest.is_empty() { home } else { home.join(rest) };
        }
    }
    PathBuf::from(path)
}

/// Load app config. A missing file is the normal first-run case → default.
/// A corrupt file is logged and treated as default rather than crashing boot:
/// there is no UI thread to toast on this early, and a broken config must never
/// wedge startup.
pub fn load(houston: &Path) -> AppConfig {
    let path = config_path(houston);
    let contents = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return AppConfig::default(),
        Err(e) => {
            tracing::warn!("[app-config] read {} failed: {e}", path.display());
            return AppConfig::default();
        }
    };
    match serde_json::from_str(&contents) {
        Ok(cfg) => cfg,
        Err(e) => {
            tracing::warn!(
                "[app-config] parse {} failed: {e}; using defaults",
                path.display()
            );
            AppConfig::default()
        }
    }
}

/// Persist app config atomically (temp + rename), matching the Houston
/// file-write convention.
pub fn save(houston: &Path, cfg: &AppConfig) -> io::Result<()> {
    std::fs::create_dir_all(houston)?;
    let path = config_path(houston);
    let json = serde_json::to_string_pretty(cfg)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
    let tmp = path.with_extension(format!("json.tmp-{}", std::process::id()));
    std::fs::write(&tmp, json.as_bytes())?;
    std::fs::rename(&tmp, &path)?;
    Ok(())
}

/// Resolve the workspace-root (`docs`) directory the engine should use.
/// `docsRoot` from config when set + non-empty (tilde-expanded), else the
/// historical default `<home>/workspaces`.
pub fn resolve_docs_dir(houston: &Path, cfg: &AppConfig) -> PathBuf {
    match cfg
        .docs_root
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        Some(root) => expand_tilde(root),
        None => houston.join("workspaces"),
    }
}

/// Move an existing workspace tree from `old_root` to `new_root` when a user
/// opts into a visible, git-backed root. Idempotent + non-destructive: it only
/// moves when `new_root` has no `workspaces.json` yet, and never overwrites an
/// entry that already exists in the target. Mirrors the legacy-docs migration
/// (`migrate_legacy_docs_dir`). Returns `Ok(true)` when a move happened.
///
/// `old_root` and `new_root` are expected to live on the same filesystem (both
/// under `$HOME`), so per-entry `rename` is atomic and cheap.
pub fn migrate_docs_root(old_root: &Path, new_root: &Path) -> io::Result<bool> {
    if !old_root.join("workspaces.json").is_file() {
        return Ok(false); // nothing to migrate
    }
    if new_root.join("workspaces.json").is_file() {
        return Ok(false); // target already populated — never clobber
    }
    std::fs::create_dir_all(new_root)?;
    let mut moved = false;
    for entry in std::fs::read_dir(old_root)? {
        let entry = entry?;
        let dst = new_root.join(entry.file_name());
        if dst.exists() {
            continue; // never overwrite an existing entry in the target
        }
        std::fs::rename(entry.path(), &dst)?;
        moved = true;
    }
    Ok(moved)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn absent_config_resolves_to_default() {
        let d = TempDir::new().unwrap();
        let cfg = load(d.path());
        assert!(cfg.docs_root.is_none());
        assert_eq!(resolve_docs_dir(d.path(), &cfg), d.path().join("workspaces"));
    }

    #[test]
    fn save_then_load_roundtrip() {
        let d = TempDir::new().unwrap();
        let cfg = AppConfig {
            docs_root: Some("/abs/Houston".into()),
        };
        save(d.path(), &cfg).unwrap();
        let got = load(d.path());
        assert_eq!(got, cfg);
        assert_eq!(
            resolve_docs_dir(d.path(), &got),
            PathBuf::from("/abs/Houston")
        );
    }

    #[test]
    fn empty_or_whitespace_docs_root_falls_back_to_default() {
        let d = TempDir::new().unwrap();
        let cfg = AppConfig {
            docs_root: Some("   ".into()),
        };
        assert_eq!(resolve_docs_dir(d.path(), &cfg), d.path().join("workspaces"));
    }

    #[test]
    fn corrupt_config_is_default_not_panic() {
        let d = TempDir::new().unwrap();
        std::fs::write(d.path().join(FILE_NAME), "{not json").unwrap();
        let cfg = load(d.path());
        assert_eq!(cfg, AppConfig::default());
    }

    #[test]
    fn tilde_expands_to_home() {
        let d = TempDir::new().unwrap();
        let cfg = AppConfig {
            docs_root: Some("~/Houston".into()),
        };
        if let Some(home) = dirs::home_dir() {
            assert_eq!(resolve_docs_dir(d.path(), &cfg), home.join("Houston"));
        }
    }

    #[test]
    fn save_is_atomic_and_overwrites() {
        let d = TempDir::new().unwrap();
        save(
            d.path(),
            &AppConfig {
                docs_root: Some("/one".into()),
            },
        )
        .unwrap();
        save(
            d.path(),
            &AppConfig {
                docs_root: Some("/two".into()),
            },
        )
        .unwrap();
        assert_eq!(load(d.path()).docs_root.as_deref(), Some("/two"));
        // No leftover temp files.
        let leftovers: Vec<_> = std::fs::read_dir(d.path())
            .unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().contains(".tmp-"))
            .collect();
        assert!(leftovers.is_empty(), "temp files leaked: {leftovers:?}");
    }

    #[test]
    fn migrate_moves_tree_when_target_empty() {
        let tmp = TempDir::new().unwrap();
        let old = tmp.path().join("old");
        let new = tmp.path().join("Houston");
        std::fs::create_dir_all(old.join("Work/Agent")).unwrap();
        std::fs::write(old.join("workspaces.json"), "[]").unwrap();
        std::fs::write(old.join("Work/Agent/CLAUDE.md"), "x").unwrap();

        assert!(migrate_docs_root(&old, &new).unwrap());
        assert!(new.join("workspaces.json").is_file());
        assert!(new.join("Work/Agent/CLAUDE.md").is_file());
        // Second call is a no-op (old no longer has a manifest).
        assert!(!migrate_docs_root(&old, &new).unwrap());
    }

    #[test]
    fn migrate_noop_without_source_manifest() {
        let tmp = TempDir::new().unwrap();
        let old = tmp.path().join("old");
        std::fs::create_dir_all(&old).unwrap();
        assert!(!migrate_docs_root(&old, &tmp.path().join("new")).unwrap());
    }

    #[test]
    fn migrate_never_clobbers_populated_target() {
        let tmp = TempDir::new().unwrap();
        let old = tmp.path().join("old");
        let new = tmp.path().join("new");
        std::fs::create_dir_all(&old).unwrap();
        std::fs::create_dir_all(&new).unwrap();
        std::fs::write(old.join("workspaces.json"), "[\"old\"]").unwrap();
        std::fs::write(new.join("workspaces.json"), "[\"new\"]").unwrap();
        assert!(!migrate_docs_root(&old, &new).unwrap());
        assert_eq!(
            std::fs::read_to_string(new.join("workspaces.json")).unwrap(),
            "[\"new\"]"
        );
    }
}
