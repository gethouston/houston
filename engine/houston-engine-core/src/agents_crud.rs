//! Workspace-scoped agent CRUD — relocated from
//! `app/src-tauri/src/commands/agents.rs`.
//!
//! Each agent lives at `<workspaces_root>/<workspace_name>/<agent_name>/`
//! with metadata in `.houston/agent.json`. Linked (external) projects use
//! a symlink whose target is the real path on disk.
//!
//! Transport-neutral: REST routes, CLI tools, and the Tauri adapter all
//! consume this module.

use crate::error::{CoreError, CoreResult};
use crate::paths::{expand_tilde, rename_path, same_fs_entity};
use crate::workspaces;
use crate::agent_policy::AgentPolicy;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AgentMeta {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub config_id: String,
    pub color: Option<String>,
    pub created_at: String,
    pub last_opened_at: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Agent {
    pub id: String,
    pub name: String,
    pub folder_path: String,
    pub config_id: String,
    pub color: Option<String>,
    pub created_at: String,
    pub last_opened_at: Option<String>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CreateAgent {
    pub name: String,
    pub config_id: String,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub claude_md: Option<String>,
    #[serde(default)]
    pub installed_path: Option<String>,
    #[serde(default)]
    pub seeds: Option<HashMap<String, String>>,
    #[serde(default)]
    pub existing_path: Option<String>,
    #[serde(default)]
    pub policy: Option<AgentPolicy>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CreateAgentResult {
    pub agent: Agent,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAgent {
    pub color: String,
}

fn houston_dir(folder: &Path) -> PathBuf {
    folder.join(".houston")
}

fn agent_json_path(folder: &Path) -> PathBuf {
    houston_dir(folder).join("agent.json")
}

fn read_agent_meta(folder: &Path) -> CoreResult<AgentMeta> {
    let path = agent_json_path(folder);
    let contents = fs::read_to_string(&path)?;
    Ok(serde_json::from_str(&contents)?)
}

fn write_agent_meta(folder: &Path, meta: &AgentMeta) -> CoreResult<()> {
    let dir = houston_dir(folder);
    fs::create_dir_all(&dir)?;
    let target = dir.join("agent.json");
    let tmp = dir.join("agent.json.tmp");
    let json = serde_json::to_string_pretty(meta)?;
    fs::write(&tmp, &json)?;
    fs::rename(&tmp, &target)?;
    Ok(())
}

fn meta_to_agent(folder: &Path, meta: &AgentMeta) -> Agent {
    let name = meta.name.clone().unwrap_or_else(|| {
        folder
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default()
    });
    let real_path = fs::canonicalize(folder).unwrap_or_else(|_| folder.to_path_buf());
    Agent {
        id: meta.id.clone(),
        name,
        folder_path: real_path.to_string_lossy().to_string(),
        config_id: meta.config_id.clone(),
        color: meta.color.clone(),
        created_at: meta.created_at.clone(),
        last_opened_at: meta.last_opened_at.clone(),
    }
}

fn find_agent_by_id(ws_dir: &Path, id: &str) -> CoreResult<PathBuf> {
    let entries = fs::read_dir(ws_dir)?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        if !agent_json_path(&path).exists() {
            continue;
        }
        if let Ok(meta) = read_agent_meta(&path) {
            if meta.id == id {
                return Ok(path);
            }
        }
    }
    Err(CoreError::NotFound(format!("Agent not found: {id}")))
}

fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

/// Resolve the workspace folder from (root, workspace_id).
fn resolve_ws_folder(root: &Path, workspace_id: &str) -> CoreResult<PathBuf> {
    let workspaces = workspaces::read_all(root)?;
    let ws = workspaces
        .iter()
        .find(|w| w.id == workspace_id)
        .ok_or_else(|| CoreError::NotFound(format!("Workspace not found: {workspace_id}")))?;
    let folder = root.join(&ws.name);
    fs::create_dir_all(&folder)?;
    Ok(folder)
}

fn seed_json_if_missing(houston: &Path, filename: &str, content: &str) -> CoreResult<()> {
    let path = houston.join(filename);
    if !path.exists() {
        fs::write(&path, content)?;
    }
    Ok(())
}

fn is_activity_seed_path(path: &str) -> bool {
    matches!(
        path,
        ".houston/activity.json" | ".houston/activity/activity.json"
    )
}

/// List agents within a workspace folder.
pub fn list(root: &Path, workspace_id: &str) -> CoreResult<Vec<Agent>> {
    let ws_dir = resolve_ws_folder(root, workspace_id)?;
    let entries = fs::read_dir(&ws_dir)?;
    let mut agents = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        if path.is_symlink() && !path.exists() {
            tracing::warn!("[agents] removing dangling symlink: {name}");
            let _ = fs::remove_file(&path);
            continue;
        }
        if !path.is_dir() {
            continue;
        }
        if !agent_json_path(&path).exists() {
            continue;
        }
        match read_agent_meta(&path) {
            Ok(meta) => agents.push(meta_to_agent(&path, &meta)),
            Err(e) => tracing::warn!("[agents] skipping {name}: {e}"),
        }
    }

    agents.sort_by(|a, b| {
        let a_time = a.last_opened_at.as_deref().unwrap_or("");
        let b_time = b.last_opened_at.as_deref().unwrap_or("");
        b_time.cmp(a_time)
    });

    Ok(agents)
}

pub fn create(root: &Path, workspace_id: &str, req: CreateAgent) -> CoreResult<CreateAgentResult> {
    let ws_dir = resolve_ws_folder(root, workspace_id)?;

    let is_linked = req.existing_path.is_some();
    let folder = if let Some(ref ep) = req.existing_path {
        let p = expand_tilde(Path::new(ep));
        if !p.exists() {
            return Err(CoreError::BadRequest(format!(
                "Directory does not exist: {}",
                p.display()
            )));
        }
        let link_path = ws_dir.join(&req.name);
        if link_path.exists() {
            return Err(CoreError::Conflict(format!(
                "An agent named \"{}\" already exists",
                req.name
            )));
        }
        #[cfg(unix)]
        std::os::unix::fs::symlink(&p, &link_path)?;
        #[cfg(windows)]
        std::os::windows::fs::symlink_dir(&p, &link_path)?;
        p
    } else {
        let f = ws_dir.join(&req.name);
        if f.exists() {
            return Err(CoreError::Conflict(format!(
                "An agent named \"{}\" already exists",
                req.name
            )));
        }
        fs::create_dir_all(&f)?;
        f
    };

    fs::create_dir_all(folder.join(".agents/skills"))?;
    if let Some(installed_path) = req.installed_path.as_ref() {
        let packaged_skills = PathBuf::from(installed_path).join(".agents").join("skills");
        if packaged_skills.exists() {
            crate::store::copy_dir_all(&packaged_skills, &folder.join(".agents/skills"))?;
        }
    }

    let now = now_iso();
    let meta = AgentMeta {
        id: Uuid::new_v4().to_string(),
        name: if is_linked {
            Some(req.name.clone())
        } else {
            None
        },
        config_id: req.config_id.clone(),
        color: req.color,
        created_at: now.clone(),
        last_opened_at: Some(now),
    };
    write_agent_meta(&folder, &meta)?;

    if let Some(policy) = req.policy.as_ref() {
        let path = crate::agent_policy::policy_path(&folder);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&path, serde_json::to_string_pretty(policy)?)?;
    }

    let claude_md_path = folder.join("CLAUDE.md");
    if !claude_md_path.exists() {
        let content = req
            .claude_md
            .or_else(|| {
                req.installed_path
                    .as_ref()
                    .and_then(|p| fs::read_to_string(PathBuf::from(p).join("CLAUDE.md")).ok())
            })
            .unwrap_or_else(|| "## Instructions\n\n## Learnings\n".to_string());
        fs::write(&claude_md_path, &content)?;
    }

    if let Some(seed_files) = req.seeds {
        for (path, content) in &seed_files {
            if is_activity_seed_path(path) {
                continue;
            }
            let target = folder.join(path);
            if !target.exists() {
                if let Some(parent) = target.parent() {
                    fs::create_dir_all(parent)?;
                }
                fs::write(&target, content)?;
            }
        }
    }

    crate::agents::prompt::seed_agent(&folder).map_err(CoreError::Internal)?;

    let houston = houston_dir(&folder);
    seed_json_if_missing(&houston, "activity.json", "[]")?;
    seed_json_if_missing(&houston, "config.json", "{}")?;

    Ok(CreateAgentResult {
        agent: meta_to_agent(&folder, &meta),
    })
}

pub fn delete(root: &Path, workspace_id: &str, id: &str) -> CoreResult<()> {
    let ws_dir = resolve_ws_folder(root, workspace_id)?;
    let folder = find_agent_by_id(&ws_dir, id)?;
    if folder.is_symlink() {
        fs::remove_file(&folder)?;
    } else {
        fs::remove_dir_all(&folder)?;
    }
    Ok(())
}

pub fn rename(root: &Path, workspace_id: &str, id: &str, new_name: &str) -> CoreResult<Agent> {
    let ws_dir = resolve_ws_folder(root, workspace_id)?;
    let old_folder = find_agent_by_id(&ws_dir, id)?;
    let new_link = ws_dir.join(new_name);

    // A genuine conflict is a *different* agent already holding `new_name`.
    // A case-only rename of the agent's own folder ("PERA" -> "PERa") resolves
    // to the same entity on case-insensitive filesystems, so `new_link.exists()`
    // is true even though there is no collision — allow it.
    if new_link.exists() && !same_fs_entity(&old_folder, &new_link) {
        return Err(CoreError::Conflict(format!(
            "An agent named \"{new_name}\" already exists"
        )));
    }

    // Exact no-op (same path, same case): nothing to move. Defends the engine
    // even when a client fires a rename with the unchanged name.
    if old_folder == new_link {
        let meta = read_agent_meta(&old_folder)?;
        return Ok(meta_to_agent(&old_folder, &meta));
    }

    if old_folder.is_symlink() {
        let target = fs::read_link(&old_folder)?;
        fs::remove_file(&old_folder)?;
        #[cfg(unix)]
        std::os::unix::fs::symlink(&target, &new_link)?;
        #[cfg(windows)]
        std::os::windows::fs::symlink_dir(&target, &new_link)?;
        let mut meta = read_agent_meta(&new_link)?;
        meta.name = Some(new_name.to_string());
        write_agent_meta(&new_link, &meta)?;
        Ok(meta_to_agent(&new_link, &meta))
    } else {
        rename_path(&old_folder, &new_link)?;
        let meta = read_agent_meta(&new_link)?;
        Ok(meta_to_agent(&new_link, &meta))
    }
}

pub fn update(root: &Path, workspace_id: &str, id: &str, req: UpdateAgent) -> CoreResult<Agent> {
    let ws_dir = resolve_ws_folder(root, workspace_id)?;
    let folder = find_agent_by_id(&ws_dir, id)?;
    let color = req.color.trim();
    if color.is_empty() {
        return Err(CoreError::BadRequest("Agent color is required".into()));
    }

    let mut meta = read_agent_meta(&folder)?;
    meta.color = Some(color.to_string());
    write_agent_meta(&folder, &meta)?;
    Ok(meta_to_agent(&folder, &meta))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspaces::CreateWorkspace;
    use tempfile::TempDir;

    fn setup_ws(root: &Path) -> String {
        workspaces::create(
            root,
            CreateWorkspace { name: "alpha".into() },
        )
        .unwrap()
        .id
    }

    #[test]
    fn create_and_list() {
        let d = TempDir::new().unwrap();
        let ws_id = setup_ws(d.path());
        let res = create(
            d.path(),
            &ws_id,
            CreateAgent {
                name: "first".into(),
                config_id: "blank".into(),
                color: None,
                claude_md: None,
                installed_path: None,
                seeds: None,
                existing_path: None,
                policy: None,
            },
        )
        .unwrap();
        assert_eq!(res.agent.name, "first");
        assert_eq!(
            fs::read_to_string(d.path().join("alpha/first/.houston/activity.json")).unwrap(),
            "[]"
        );

        let all = list(d.path(), &ws_id).unwrap();
        assert_eq!(all.len(), 1);
    }

    #[test]
    fn create_ignores_template_activity_seed() {
        let d = TempDir::new().unwrap();
        let ws_id = setup_ws(d.path());
        let mut seeds = HashMap::new();
        seeds.insert(
            ".houston/activity.json".to_string(),
            r#"[{"id":"seeded","title":"Start anywhere - I'll ask for what I need","description":"No upfront onboarding.","status":"needs_you"}]"#.to_string(),
        );

        create(
            d.path(),
            &ws_id,
            CreateAgent {
                name: "store-agent".into(),
                config_id: "engineering".into(),
                color: None,
                claude_md: None,
                installed_path: None,
                seeds: Some(seeds),
                existing_path: None,
                policy: None,
            },
        )
        .unwrap();

        assert_eq!(
            fs::read_to_string(d.path().join("alpha/store-agent/.houston/activity.json")).unwrap(),
            "[]"
        );
    }

    #[test]
    fn create_persists_initial_policy() {
        let d = TempDir::new().unwrap();
        let ws_id = setup_ws(d.path());
        create(
            d.path(),
            &ws_id,
            CreateAgent {
                name: "finance".into(),
                config_id: "blank".into(),
                color: None,
                claude_md: None,
                installed_path: None,
                seeds: None,
                existing_path: None,
                policy: Some(AgentPolicy {
                    allowed_roots: vec!["reports".into()],
                    include_workspace_context: true,
                    ..AgentPolicy::default()
                }),
            },
        )
        .unwrap();

        let policy = crate::agent_policy::load(&d.path().join("alpha/finance")).unwrap();
        assert_eq!(policy.allowed_roots, vec!["reports"]);
        assert!(policy.include_workspace_context);
    }

    #[test]
    fn rename_and_delete() {
        let d = TempDir::new().unwrap();
        let ws_id = setup_ws(d.path());
        let res = create(
            d.path(),
            &ws_id,
            CreateAgent {
                name: "n".into(),
                config_id: "gmail".into(),
                color: None,
                claude_md: None,
                installed_path: None,
                seeds: None,
                existing_path: None,
                policy: None,
            },
        )
        .unwrap();
        let renamed = rename(d.path(), &ws_id, &res.agent.id, "m").unwrap();
        assert_eq!(renamed.name, "m");
        // The folder moves on disk, so the returned record must carry the NEW
        // path. The desktop store relies on this to repoint its file watcher;
        // a stale path makes the watch fail with an error toast (#298).
        assert_eq!(
            Path::new(&renamed.folder_path)
                .file_name()
                .and_then(|n| n.to_str()),
            Some("m"),
        );
        assert!(
            !d.path().join("alpha/n").exists(),
            "old agent folder should no longer exist after rename"
        );
        assert!(d.path().join("alpha/m/.houston/agent.json").exists());
        delete(d.path(), &ws_id, &res.agent.id).unwrap();
        assert!(list(d.path(), &ws_id).unwrap().is_empty());
    }

    #[test]
    fn update_color_persists() {
        let d = TempDir::new().unwrap();
        let ws_id = setup_ws(d.path());
        let res = create(
            d.path(),
            &ws_id,
            CreateAgent {
                name: "n".into(),
                config_id: "gmail".into(),
                color: None,
                claude_md: None,
                installed_path: None,
                seeds: None,
                existing_path: None,
                policy: None,
            },
        )
        .unwrap();

        let updated = update(
            d.path(),
            &ws_id,
            &res.agent.id,
            UpdateAgent {
                color: "forest".into(),
            },
        )
        .unwrap();

        assert_eq!(updated.color.as_deref(), Some("forest"));
        let all = list(d.path(), &ws_id).unwrap();
        assert_eq!(all[0].color.as_deref(), Some("forest"));
    }

    fn create_named(root: &Path, ws_id: &str, name: &str) -> Agent {
        create(
            root,
            ws_id,
            CreateAgent {
                name: name.into(),
                config_id: "blank".into(),
                color: None,
                claude_md: None,
                installed_path: None,
                seeds: None,
                existing_path: None,
                policy: None,
            },
        )
        .unwrap()
        .agent
    }

    /// Renaming to the unchanged name is a no-op, not a conflict. Guards #325 at
    /// the engine level regardless of which client fires it. FS-independent.
    #[test]
    fn rename_to_same_name_is_noop() {
        let d = TempDir::new().unwrap();
        let ws_id = setup_ws(d.path());
        let agent = create_named(d.path(), &ws_id, "PERA");

        let renamed = rename(d.path(), &ws_id, &agent.id, "PERA").unwrap();

        assert_eq!(renamed.id, agent.id);
        assert_eq!(renamed.name, "PERA");
        assert_eq!(list(d.path(), &ws_id).unwrap().len(), 1);
    }

    /// A case-only change ("PERA" -> "PERa") must succeed and leave exactly one
    /// agent under the new spelling. On case-insensitive filesystems (Windows,
    /// default macOS) this is the bug from PR #339's testing: the destination
    /// resolves to the agent's own folder, so the old `new_link.exists()` guard
    /// wrongly reported "already exists".
    #[test]
    fn rename_case_only_change() {
        let d = TempDir::new().unwrap();
        let ws_id = setup_ws(d.path());
        let agent = create_named(d.path(), &ws_id, "PERA");

        let renamed = rename(d.path(), &ws_id, &agent.id, "PERa").unwrap();

        assert_eq!(renamed.id, agent.id);
        assert_eq!(renamed.name, "PERa");
        let all = list(d.path(), &ws_id).unwrap();
        assert_eq!(all.len(), 1, "case-only rename must not duplicate the agent");
        assert_eq!(all[0].name, "PERa");
    }

    /// Renaming onto a *different* agent's name is still a real conflict.
    #[test]
    fn rename_conflicts_with_other_agent() {
        let d = TempDir::new().unwrap();
        let ws_id = setup_ws(d.path());
        create_named(d.path(), &ws_id, "PERA");
        let zed = create_named(d.path(), &ws_id, "ZED");

        let err = rename(d.path(), &ws_id, &zed.id, "PERA").unwrap_err();

        assert!(matches!(err, CoreError::Conflict(_)));
        assert_eq!(list(d.path(), &ws_id).unwrap().len(), 2);
    }
}
