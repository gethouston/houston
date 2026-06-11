//! Workspace CRUD — relocated from `app/src-tauri/src/commands/workspaces.rs`.
//!
//! Transport-neutral: operates on a filesystem root. HTTP routes call these
//! functions; so do tests and CLI tools. File I/O lives in [`io`], which
//! also owns the self-healing read used to recover `workspaces.json` files
//! corrupted by the 0.4.19 concurrent-writer race.

mod io;
mod migrate;

pub use io::read_all;
pub use migrate::migrate_workspace_provider_into_agents;

use crate::error::{CoreError, CoreResult};
use crate::paths::{rename_path, same_fs_entity};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use uuid::Uuid;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub is_default: bool,
    pub created_at: String,
    /// Optional per-workspace UI locale override (BCP-47 base tag: `"en"`,
    /// `"es"`, `"pt"`). When set, frontends prefer it over the global
    /// `preferences::locale` value; when `None` the workspace inherits that
    /// global default. Additive + `skip_serializing_if` so pre-existing
    /// `workspaces.json` files (which lack the key) parse unchanged and a
    /// workspace that never picked a language never grows a `locale` key.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub locale: Option<String>,
    // Legacy fields. They're still parsed here so the migration can read
    // pre-0.5 workspace files; once `migrate_workspace_provider_into_agents`
    // runs they're stripped from disk and the resolver no longer consults
    // them. Keep `skip_serializing_if = "Option::is_none"` so a freshly
    // written `workspaces.json` doesn't carry the dead keys forward.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorkspace {
    pub name: String,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RenameWorkspace {
    pub new_name: String,
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

pub fn list(root: &Path) -> CoreResult<Vec<Workspace>> {
    fs::create_dir_all(root)?;
    read_all(root)
}

pub fn create(root: &Path, req: CreateWorkspace) -> CoreResult<Workspace> {
    let mut workspaces = read_all(root)?;
    if workspaces.iter().any(|w| w.name == req.name) {
        return Err(CoreError::Conflict(format!(
            "workspace named {:?} already exists",
            req.name
        )));
    }
    let ws = Workspace {
        id: Uuid::new_v4().to_string(),
        name: req.name.clone(),
        is_default: false,
        created_at: now_iso(),
        locale: None,
        provider: None,
        model: None,
    };
    let ws_dir = root.join(&req.name);
    fs::create_dir_all(ws_dir.join(".houston"))?;
    let connections = ws_dir.join(".houston").join("connections.json");
    if !connections.exists() {
        fs::write(&connections, "[]")?;
    }
    workspaces.push(ws.clone());
    io::write_all(root, &workspaces)?;
    Ok(ws)
}

pub fn rename(root: &Path, id: &str, req: RenameWorkspace) -> CoreResult<Workspace> {
    let mut workspaces = read_all(root)?;
    if workspaces
        .iter()
        .any(|w| w.name == req.new_name && w.id != id)
    {
        return Err(CoreError::Conflict(format!(
            "workspace named {:?} already exists",
            req.new_name
        )));
    }
    let ws = workspaces
        .iter_mut()
        .find(|w| w.id == id)
        .ok_or_else(|| CoreError::NotFound(format!("workspace {id}")))?;
    let old_dir = root.join(&ws.name);
    let new_dir = root.join(&req.new_name);
    // Same entity = renaming the workspace's own folder (including a case-only
    // change like "Acme" -> "ACME" on a case-insensitive filesystem, where
    // `new_dir.exists()` is true because it resolves to `old_dir`). Only a
    // *different* directory occupying `new_name` is a real conflict.
    if new_dir.exists() && !same_fs_entity(&old_dir, &new_dir) {
        return Err(CoreError::Conflict(format!(
            "directory named {:?} already exists",
            req.new_name
        )));
    }
    if old_dir.exists() {
        rename_path(&old_dir, &new_dir)?;
    }
    ws.name = req.new_name;
    let updated = ws.clone();
    io::write_all(root, &workspaces)?;
    Ok(updated)
}

/// Set (or clear) a workspace's UI-locale override. An empty / whitespace
/// value clears it — mirroring how `preferences::locale` treats blanks — so
/// the workspace falls back to the global `locale` preference. The value is
/// stored verbatim (frontends normalize BCP-47 tags); the engine stays
/// locale-agnostic.
pub fn set_locale(root: &Path, id: &str, locale: Option<String>) -> CoreResult<Workspace> {
    let mut workspaces = read_all(root)?;
    let ws = workspaces
        .iter_mut()
        .find(|w| w.id == id)
        .ok_or_else(|| CoreError::NotFound(format!("workspace {id}")))?;
    ws.locale = locale.filter(|s| !s.trim().is_empty());
    let updated = ws.clone();
    io::write_all(root, &workspaces)?;
    Ok(updated)
}

pub fn delete(root: &Path, id: &str) -> CoreResult<()> {
    let workspaces = read_all(root)?;
    let ws = workspaces
        .iter()
        .find(|w| w.id == id)
        .ok_or_else(|| CoreError::NotFound(format!("workspace {id}")))?;
    if ws.is_default {
        return Err(CoreError::BadRequest(
            "cannot delete the default workspace".into(),
        ));
    }
    let ws_dir = root.join(&ws.name);
    let remaining: Vec<Workspace> = workspaces.iter().filter(|w| w.id != id).cloned().collect();
    io::write_all(root, &remaining)?;
    if ws_dir.exists() {
        fs::remove_dir_all(&ws_dir)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn tmp() -> TempDir {
        TempDir::new().unwrap()
    }

    #[test]
    fn list_empty() {
        let d = tmp();
        assert!(list(d.path()).unwrap().is_empty());
    }

    #[test]
    fn create_then_list() {
        let d = tmp();
        let ws = create(
            d.path(),
            CreateWorkspace {
                name: "alpha".into(),
            },
        )
        .unwrap();
        assert_eq!(ws.name, "alpha");
        let all = list(d.path()).unwrap();
        assert_eq!(all.len(), 1);
        assert!(d.path().join("alpha/.houston/connections.json").exists());
    }

    #[test]
    fn create_duplicate_conflicts() {
        let d = tmp();
        create(d.path(), CreateWorkspace { name: "a".into() }).unwrap();
        let err = create(d.path(), CreateWorkspace { name: "a".into() }).unwrap_err();
        assert!(matches!(err, CoreError::Conflict(_)));
    }

    #[test]
    fn rename_and_delete() {
        let d = tmp();
        let ws = create(d.path(), CreateWorkspace { name: "a".into() }).unwrap();
        let renamed = rename(
            d.path(),
            &ws.id,
            RenameWorkspace {
                new_name: "b".into(),
            },
        )
        .unwrap();
        assert_eq!(renamed.name, "b");
        delete(d.path(), &ws.id).unwrap();
        assert!(list(d.path()).unwrap().is_empty());
    }

    #[test]
    fn set_locale_roundtrip_and_clear() {
        let d = tmp();
        let ws = create(
            d.path(),
            CreateWorkspace {
                name: "alpha".into(),
            },
        )
        .unwrap();
        assert!(ws.locale.is_none(), "new workspace has no locale override");

        let updated = set_locale(d.path(), &ws.id, Some("es".into())).unwrap();
        assert_eq!(updated.locale.as_deref(), Some("es"));
        assert_eq!(list(d.path()).unwrap()[0].locale.as_deref(), Some("es"));

        // Whitespace-only clears the override (falls back to the global default),
        // mirroring preferences::locale.
        let cleared = set_locale(d.path(), &ws.id, Some("   ".into())).unwrap();
        assert!(cleared.locale.is_none());
        assert!(list(d.path()).unwrap()[0].locale.is_none());

        // Explicit None also clears.
        set_locale(d.path(), &ws.id, Some("pt".into())).unwrap();
        let cleared_again = set_locale(d.path(), &ws.id, None).unwrap();
        assert!(cleared_again.locale.is_none());
    }

    #[test]
    fn set_locale_unknown_id_errors() {
        let d = tmp();
        let err = set_locale(d.path(), "nope", Some("es".into())).unwrap_err();
        assert!(matches!(err, CoreError::NotFound(_)));
    }

    #[test]
    fn locale_survives_rename() {
        let d = tmp();
        let ws = create(
            d.path(),
            CreateWorkspace {
                name: "alpha".into(),
            },
        )
        .unwrap();
        set_locale(d.path(), &ws.id, Some("pt".into())).unwrap();
        rename(
            d.path(),
            &ws.id,
            RenameWorkspace {
                new_name: "beta".into(),
            },
        )
        .unwrap();
        let all = list(d.path()).unwrap();
        assert_eq!(all[0].name, "beta");
        assert_eq!(all[0].locale.as_deref(), Some("pt"));
    }

    /// A pre-`locale` `workspaces.json` (no `locale` key) must deserialize with
    /// `locale: None` — the field is additive, so existing users need no
    /// migration. And a workspace without an override must not serialize the key.
    #[test]
    fn workspace_json_without_locale_parses_and_omits_when_unset() {
        let json = r#"[{"id":"w1","name":"Personal","isDefault":true,"createdAt":"t"}]"#;
        let parsed: Vec<Workspace> = serde_json::from_str(json).unwrap();
        assert_eq!(parsed.len(), 1);
        assert!(parsed[0].locale.is_none());

        let out = serde_json::to_string(&parsed).unwrap();
        assert!(
            !out.contains("locale"),
            "an unset locale override must not be written to disk, got: {out}"
        );
    }

    #[test]
    fn rename_to_same_name_is_noop() {
        let d = tmp();
        let ws = create(
            d.path(),
            CreateWorkspace {
                name: "alpha".into(),
            },
        )
        .unwrap();
        let renamed = rename(
            d.path(),
            &ws.id,
            RenameWorkspace {
                new_name: "alpha".into(),
            },
        )
        .unwrap();
        assert_eq!(renamed.name, "alpha");
        assert_eq!(list(d.path()).unwrap().len(), 1);
        assert!(d.path().join("alpha").is_dir());
    }

    /// Case-only workspace rename ("Acme" -> "ACME"). On case-insensitive
    /// filesystems the new folder resolves to the old one, so the previous
    /// `old_dir != new_dir` string compare reported a spurious conflict.
    #[test]
    fn rename_case_only_change() {
        let d = tmp();
        let ws = create(
            d.path(),
            CreateWorkspace {
                name: "Acme".into(),
            },
        )
        .unwrap();
        let renamed = rename(
            d.path(),
            &ws.id,
            RenameWorkspace {
                new_name: "ACME".into(),
            },
        )
        .unwrap();
        assert_eq!(renamed.name, "ACME");
        let all = list(d.path()).unwrap();
        assert_eq!(
            all.len(),
            1,
            "case-only rename must not duplicate workspace"
        );
        assert_eq!(all[0].name, "ACME");
        assert!(d.path().join("ACME").is_dir());
    }

    /// Concurrent writers must not corrupt `workspaces.json`. Mirrors the
    /// original `update_provider` race test (since retired with the
    /// workspace-level provider field) — same code path through
    /// `io::write_all`, exercised here via `rename`.
    #[test]
    fn concurrent_renames_never_corrupt_index() {
        use std::sync::Arc;
        use std::thread;
        let d = tmp();
        let ws = create(
            d.path(),
            CreateWorkspace {
                name: "alpha".into(),
            },
        )
        .unwrap();
        let root = Arc::new(d.path().to_path_buf());
        let id = Arc::new(ws.id.clone());
        let mut handles = Vec::new();
        for i in 0..16 {
            let root = root.clone();
            let id = id.clone();
            handles.push(thread::spawn(move || {
                let next = if i % 2 == 0 { "alpha" } else { "beta" };
                let _ = rename(
                    &root,
                    &id,
                    RenameWorkspace {
                        new_name: next.into(),
                    },
                );
            }));
        }
        for h in handles {
            h.join().unwrap();
        }
        let raw = fs::read_to_string(d.path().join("workspaces.json")).unwrap();
        let parsed: Vec<Workspace> = serde_json::from_str(&raw)
            .expect("concurrent writes left a non-parseable workspaces.json");
        assert_eq!(parsed.len(), 1);
        for entry in fs::read_dir(d.path()).unwrap() {
            let name = entry.unwrap().file_name();
            let s = name.to_string_lossy();
            assert!(!s.ends_with(".tmp"), "leftover tmp file: {s}");
        }
    }
}
