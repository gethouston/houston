//! Workspace CRUD — relocated from `app/src-tauri/src/commands/workspaces.rs`.
//!
//! Transport-neutral: operates on a filesystem root. HTTP routes call these
//! functions; so do tests and CLI tools. File I/O lives in [`io`], which
//! also owns the self-healing read used to recover `workspaces.json` files
//! corrupted by the 0.4.19 concurrent-writer race.

mod io;

pub use io::read_all;

use crate::error::{CoreError, CoreResult};
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorkspace {
    pub name: String,
    pub provider: Option<String>,
    pub model: Option<String>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProvider {
    pub provider: String,
    pub model: Option<String>,
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
        provider: req.provider,
        model: req.model,
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
    if workspaces.iter().any(|w| w.name == req.new_name && w.id != id) {
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
    if new_dir.exists() && old_dir != new_dir {
        return Err(CoreError::Conflict(format!(
            "directory named {:?} already exists",
            req.new_name
        )));
    }
    if old_dir.exists() {
        fs::rename(&old_dir, &new_dir)?;
    }
    ws.name = req.new_name;
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

pub fn update_provider(root: &Path, id: &str, req: UpdateProvider) -> CoreResult<Workspace> {
    let mut workspaces = read_all(root)?;
    let ws = workspaces
        .iter_mut()
        .find(|w| w.id == id)
        .ok_or_else(|| CoreError::NotFound(format!("workspace {id}")))?;
    ws.provider = Some(req.provider);
    if let Some(m) = req.model {
        ws.model = Some(m);
    }
    let updated = ws.clone();
    io::write_all(root, &workspaces)?;
    Ok(updated)
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
                provider: Some("anthropic".into()),
                model: None,
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
        create(d.path(), CreateWorkspace { name: "a".into(), provider: None, model: None }).unwrap();
        let err = create(d.path(), CreateWorkspace { name: "a".into(), provider: None, model: None }).unwrap_err();
        assert!(matches!(err, CoreError::Conflict(_)));
    }

    #[test]
    fn rename_and_delete() {
        let d = tmp();
        let ws = create(d.path(), CreateWorkspace { name: "a".into(), provider: None, model: None }).unwrap();
        let renamed = rename(d.path(), &ws.id, RenameWorkspace { new_name: "b".into() }).unwrap();
        assert_eq!(renamed.name, "b");
        delete(d.path(), &ws.id).unwrap();
        assert!(list(d.path()).unwrap().is_empty());
    }

    /// Concurrent writers must not corrupt the target. With the shared
    /// `workspaces.json.tmp` path this test produced trailing-garbage files;
    /// with per-call tmp paths every read parses cleanly.
    #[test]
    fn concurrent_update_provider_never_corrupts() {
        use std::sync::Arc;
        use std::thread;
        let d = tmp();
        let ws = create(
            d.path(),
            CreateWorkspace { name: "alpha".into(), provider: Some("anthropic".into()), model: None },
        )
        .unwrap();
        let root = Arc::new(d.path().to_path_buf());
        let id = Arc::new(ws.id.clone());
        let mut handles = Vec::new();
        for i in 0..16 {
            let root = root.clone();
            let id = id.clone();
            handles.push(thread::spawn(move || {
                let provider = if i % 2 == 0 { "anthropic" } else { "openai" };
                let _ = update_provider(
                    &root,
                    &id,
                    UpdateProvider { provider: provider.into(), model: None },
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
