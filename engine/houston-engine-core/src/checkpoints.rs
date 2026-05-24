//! Per-agent `.houston/` snapshot + restore — Phase 5 of RFC #248
//! (`advanced.checkpoints`).
//!
//! Storage layout (one per workspace install):
//!
//! ```text
//! $HOUSTON_HOME/checkpoints/<agent_slug>/<checkpoint_id>/
//!   manifest.json         — Checkpoint metadata (name, created_at, size, …)
//!   snapshot.zip          — Zipped contents of the agent's folder, deflate
//! ```
//!
//! Operations are intentionally per-agent: the engine doesn't know about
//! workspaces here, just folder paths. Callers pass `agent_path` (the
//! agent's root) and the module derives the slug from it.
//!
//! Routes are always-on. UI gating happens via `advanced.checkpoints` in
//! the frontend.

use crate::error::{CoreError, CoreResult};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use uuid::Uuid;
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;

// ─── Public DTOs ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCheckpointRequest {
    pub agent_path: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListCheckpointsRequest {
    pub agent_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreCheckpointRequest {
    pub agent_path: String,
    pub checkpoint_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteCheckpointRequest {
    pub agent_path: String,
    pub checkpoint_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Checkpoint {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckpointListResponse {
    pub checkpoints: Vec<Checkpoint>,
}

// ─── Public API ────────────────────────────────────────────────────────

pub async fn create(home: &Path, req: CreateCheckpointRequest) -> CoreResult<Checkpoint> {
    let agent_path = expand(&req.agent_path);
    if !agent_path.is_dir() {
        return Err(CoreError::BadRequest(format!(
            "agent path is not a directory: {}",
            agent_path.display()
        )));
    }
    let trimmed = req.name.trim();
    if trimmed.is_empty() {
        return Err(CoreError::BadRequest(
            "checkpoint name cannot be empty".into(),
        ));
    }
    let id = Uuid::new_v4().to_string();
    let dir = checkpoint_dir(home, &agent_path, &id);
    fs::create_dir_all(&dir)
        .map_err(|e| CoreError::Internal(format!("create checkpoint dir: {e}")))?;
    let zip_path = dir.join("snapshot.zip");
    write_zip_of_dir(&agent_path, &zip_path)?;
    let size_bytes = fs::metadata(&zip_path).map(|m| m.len()).unwrap_or(0);
    let checkpoint = Checkpoint {
        id: id.clone(),
        name: trimmed.to_string(),
        created_at: Utc::now().to_rfc3339(),
        size_bytes,
    };
    let manifest_path = dir.join("manifest.json");
    let manifest = serde_json::to_string_pretty(&checkpoint).map_err(CoreError::Json)?;
    fs::write(&manifest_path, manifest).map_err(CoreError::Io)?;
    Ok(checkpoint)
}

pub async fn list(home: &Path, req: ListCheckpointsRequest) -> CoreResult<CheckpointListResponse> {
    let agent_path = expand(&req.agent_path);
    let root = agent_checkpoints_root(home, &agent_path);
    let mut checkpoints = Vec::new();
    if !root.is_dir() {
        return Ok(CheckpointListResponse { checkpoints });
    }
    for entry in fs::read_dir(&root).map_err(CoreError::Io)? {
        let entry = entry.map_err(CoreError::Io)?;
        if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let manifest_path = entry.path().join("manifest.json");
        if !manifest_path.is_file() {
            continue;
        }
        let raw = match fs::read_to_string(&manifest_path) {
            Ok(s) => s,
            Err(err) => {
                tracing::warn!(
                    "skipping checkpoint with unreadable manifest at {}: {err}",
                    manifest_path.display()
                );
                continue;
            }
        };
        match serde_json::from_str::<Checkpoint>(&raw) {
            Ok(cp) => checkpoints.push(cp),
            Err(err) => tracing::warn!(
                "skipping checkpoint with malformed manifest at {}: {err}",
                manifest_path.display()
            ),
        }
    }
    // Newest first.
    checkpoints.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(CheckpointListResponse { checkpoints })
}

pub async fn restore(home: &Path, req: RestoreCheckpointRequest) -> CoreResult<()> {
    let agent_path = expand(&req.agent_path);
    if !agent_path.is_dir() {
        return Err(CoreError::BadRequest(format!(
            "agent path is not a directory: {}",
            agent_path.display()
        )));
    }
    let dir = checkpoint_dir(home, &agent_path, &req.checkpoint_id);
    let zip_path = dir.join("snapshot.zip");
    if !zip_path.is_file() {
        return Err(CoreError::NotFound(format!(
            "no snapshot for checkpoint {}",
            req.checkpoint_id
        )));
    }
    extract_zip_into_dir(&zip_path, &agent_path)?;
    Ok(())
}

pub async fn delete(home: &Path, req: DeleteCheckpointRequest) -> CoreResult<()> {
    let agent_path = expand(&req.agent_path);
    let dir = checkpoint_dir(home, &agent_path, &req.checkpoint_id);
    if !dir.exists() {
        return Err(CoreError::NotFound(format!(
            "checkpoint {} not found",
            req.checkpoint_id
        )));
    }
    fs::remove_dir_all(&dir).map_err(CoreError::Io)?;
    Ok(())
}

// ─── Internals ─────────────────────────────────────────────────────────

fn expand(s: &str) -> PathBuf {
    // Trim tilde expansion through `dirs::home_dir()` to match the
    // existing worktree.rs convention.
    if let Some(rest) = s.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest);
        }
    }
    PathBuf::from(s)
}

fn agent_slug(agent_path: &Path) -> String {
    // SHA-256 of the canonical path, hex, first 16 chars — deterministic
    // and filesystem-safe across all OSes.
    let canon = agent_path
        .canonicalize()
        .unwrap_or_else(|_| agent_path.to_path_buf());
    let mut hasher = Sha256::new();
    hasher.update(canon.to_string_lossy().as_bytes());
    let hex = format!("{:x}", hasher.finalize());
    hex[..16].to_string()
}

fn agent_checkpoints_root(home: &Path, agent_path: &Path) -> PathBuf {
    home.join("checkpoints").join(agent_slug(agent_path))
}

fn checkpoint_dir(home: &Path, agent_path: &Path, id: &str) -> PathBuf {
    agent_checkpoints_root(home, agent_path).join(id)
}

fn write_zip_of_dir(src: &Path, dest_zip: &Path) -> CoreResult<()> {
    let zip_file =
        File::create(dest_zip).map_err(|e| CoreError::Internal(format!("create zip: {e}")))?;
    let mut zip = zip::ZipWriter::new(zip_file);
    let opts: SimpleFileOptions = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o644);
    let mut buf = Vec::with_capacity(64 * 1024);
    for entry in WalkDir::new(src).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        let rel = match path.strip_prefix(src) {
            Ok(p) => p,
            Err(_) => continue,
        };
        if rel.as_os_str().is_empty() {
            continue;
        }
        // Skip the checkpoint storage itself to avoid recursive bloat if
        // the agent dir ever overlaps the checkpoint root (it shouldn't,
        // but defensive).
        if rel.starts_with("checkpoints") {
            continue;
        }
        let name = rel.to_string_lossy().replace('\\', "/");
        if entry.file_type().is_dir() {
            zip.add_directory(name, opts)
                .map_err(|e| CoreError::Internal(format!("zip add dir: {e}")))?;
            continue;
        }
        if entry.file_type().is_file() {
            zip.start_file(name, opts)
                .map_err(|e| CoreError::Internal(format!("zip start file: {e}")))?;
            buf.clear();
            let mut f = File::open(path).map_err(CoreError::Io)?;
            f.read_to_end(&mut buf).map_err(CoreError::Io)?;
            zip.write_all(&buf)
                .map_err(|e| CoreError::Internal(format!("zip write: {e}")))?;
        }
    }
    zip.finish()
        .map_err(|e| CoreError::Internal(format!("zip finish: {e}")))?;
    Ok(())
}

fn extract_zip_into_dir(zip_path: &Path, dest: &Path) -> CoreResult<()> {
    let f = File::open(zip_path).map_err(CoreError::Io)?;
    let mut archive =
        zip::ZipArchive::new(f).map_err(|e| CoreError::Internal(format!("zip open: {e}")))?;
    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| CoreError::Internal(format!("zip read entry: {e}")))?;
        let rel = match entry.enclosed_name() {
            Some(p) => p.to_path_buf(),
            None => continue, // skip unsafe path
        };
        let out = dest.join(&rel);
        if entry.is_dir() {
            fs::create_dir_all(&out).map_err(CoreError::Io)?;
            continue;
        }
        if let Some(parent) = out.parent() {
            fs::create_dir_all(parent).map_err(CoreError::Io)?;
        }
        let mut writer = File::create(&out).map_err(CoreError::Io)?;
        std::io::copy(&mut entry, &mut writer).map_err(CoreError::Io)?;
    }
    Ok(())
}

// ─── Tests ─────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn create_and_list_round_trip() {
        let home = TempDir::new().unwrap();
        let agent = TempDir::new().unwrap();
        std::fs::write(agent.path().join("hello.txt"), "hi").unwrap();
        std::fs::create_dir_all(agent.path().join(".houston/role")).unwrap();
        std::fs::write(
            agent.path().join(".houston/role/role.md"),
            "I am the bookkeeper.",
        )
        .unwrap();

        let cp = create(
            home.path(),
            CreateCheckpointRequest {
                agent_path: agent.path().to_string_lossy().to_string(),
                name: "before refactor".into(),
            },
        )
        .await
        .expect("create ok");
        assert_eq!(cp.name, "before refactor");
        assert!(cp.size_bytes > 0);

        let listed = list(
            home.path(),
            ListCheckpointsRequest {
                agent_path: agent.path().to_string_lossy().to_string(),
            },
        )
        .await
        .expect("list ok");
        assert_eq!(listed.checkpoints.len(), 1);
        assert_eq!(listed.checkpoints[0].id, cp.id);
    }

    #[tokio::test]
    async fn restore_recovers_deleted_file() {
        let home = TempDir::new().unwrap();
        let agent = TempDir::new().unwrap();
        std::fs::write(agent.path().join("a.txt"), "snapshot value").unwrap();

        let cp = create(
            home.path(),
            CreateCheckpointRequest {
                agent_path: agent.path().to_string_lossy().to_string(),
                name: "v1".into(),
            },
        )
        .await
        .expect("create ok");

        // Mutate after snapshot.
        std::fs::write(agent.path().join("a.txt"), "mutated").unwrap();

        restore(
            home.path(),
            RestoreCheckpointRequest {
                agent_path: agent.path().to_string_lossy().to_string(),
                checkpoint_id: cp.id.clone(),
            },
        )
        .await
        .expect("restore ok");

        let recovered = std::fs::read_to_string(agent.path().join("a.txt")).unwrap();
        assert_eq!(recovered, "snapshot value");
    }

    #[tokio::test]
    async fn delete_removes_checkpoint() {
        let home = TempDir::new().unwrap();
        let agent = TempDir::new().unwrap();
        std::fs::write(agent.path().join("x.txt"), "x").unwrap();

        let cp = create(
            home.path(),
            CreateCheckpointRequest {
                agent_path: agent.path().to_string_lossy().to_string(),
                name: "doomed".into(),
            },
        )
        .await
        .expect("create");

        delete(
            home.path(),
            DeleteCheckpointRequest {
                agent_path: agent.path().to_string_lossy().to_string(),
                checkpoint_id: cp.id.clone(),
            },
        )
        .await
        .expect("delete");

        let after = list(
            home.path(),
            ListCheckpointsRequest {
                agent_path: agent.path().to_string_lossy().to_string(),
            },
        )
        .await
        .expect("list");
        assert!(after.checkpoints.is_empty());
    }
}
