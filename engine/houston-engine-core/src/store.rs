//! Houston Store — relocated from `app/src-tauri/src/commands/store.rs`.
//!
//! Catalog + search talk to the remote store API. Install/update flows fetch
//! files from GitHub into the user's local agents directory. All functions
//! are transport-neutral: HTTP routes call these; so do tests and CLI tools.

use crate::error::{CoreError, CoreResult};
use crate::workspaces::{self, CreateWorkspace, Workspace};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

mod bundled;
pub(crate) use bundled::copy_dir_all;
use bundled::{bundled_catalog, install_bundled_agent};

const STORE_API_DEFAULT: &str = "https://store.gethouston.ai/api";

fn store_api() -> String {
    std::env::var("HOUSTON_STORE_API").unwrap_or_else(|_| STORE_API_DEFAULT.to_string())
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct StoreListing {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: String,
    pub author: String,
    pub tags: Vec<String>,
    pub icon_url: String,
    #[serde(default)]
    pub integrations: Vec<String>,
    pub repo: String,
    pub installs: i64,
    pub registered_at: String,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub content_hash: Option<String>,
    #[serde(default)]
    pub bundled: bool,
}

#[derive(Deserialize)]
struct CatalogResponse {
    agents: Vec<StoreListing>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InstallAgent {
    pub repo: String,
    pub agent_id: String,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InstallFromGithub {
    pub github_url: String,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImportedWorkspace {
    pub workspace_id: String,
    pub workspace_name: String,
    pub agent_ids: Vec<String>,
}

fn net(e: impl std::fmt::Display) -> CoreError {
    CoreError::Internal(format!("network: {e}"))
}

pub async fn fetch_catalog() -> CoreResult<Vec<StoreListing>> {
    if let Some(agents) = bundled_catalog()? {
        return Ok(agents);
    }

    let url = format!("{}/catalog", store_api());
    let resp = reqwest::get(&url).await.map_err(net)?;
    if !resp.status().is_success() {
        return Err(CoreError::Internal(format!(
            "store catalog returned {}",
            resp.status()
        )));
    }
    let body: CatalogResponse = resp.json().await.map_err(net)?;
    Ok(body.agents)
}

pub async fn search(query: &str) -> CoreResult<Vec<StoreListing>> {
    if let Some(agents) = bundled_catalog()? {
        let q = query.trim().to_lowercase();
        if q.is_empty() {
            return Ok(agents);
        }
        return Ok(agents
            .into_iter()
            .filter(|listing| {
                listing.name.to_lowercase().contains(&q)
                    || listing.description.to_lowercase().contains(&q)
                    || listing
                        .tags
                        .iter()
                        .any(|tag| tag.to_lowercase().contains(&q))
                    || listing
                        .integrations
                        .iter()
                        .any(|toolkit| toolkit.to_lowercase().contains(&q))
            })
            .collect());
    }

    let url = format!("{}/search?q={}", store_api(), urlencoded(query));
    let resp = reqwest::get(&url).await.map_err(net)?;
    if !resp.status().is_success() {
        return Err(CoreError::Internal(format!(
            "store search returned {}",
            resp.status()
        )));
    }
    let body: CatalogResponse = resp.json().await.map_err(net)?;
    Ok(body.agents)
}

pub async fn install_agent(agents_dir: &Path, req: InstallAgent) -> CoreResult<()> {
    if let Some(agent_id) = req.repo.strip_prefix("houston-store/") {
        return install_bundled_agent(agents_dir, agent_id, Some(&req.agent_id));
    }

    let dir = agents_dir.join(&req.agent_id);
    fs::create_dir_all(&dir)?;

    let config_url = format!(
        "https://raw.githubusercontent.com/{}/main/houston.json",
        req.repo
    );
    let config_resp = reqwest::get(&config_url).await.map_err(net)?;
    if !config_resp.status().is_success() {
        return Err(CoreError::Internal(format!(
            "houston.json fetch returned {}",
            config_resp.status()
        )));
    }
    let config_bytes = config_resp.bytes().await.map_err(net)?;
    fs::write(dir.join("houston.json"), &config_bytes)?;

    let icon_url = format!(
        "https://raw.githubusercontent.com/{}/main/icon.png",
        req.repo
    );
    if let Ok(icon_resp) = reqwest::get(&icon_url).await {
        if icon_resp.status().is_success() {
            if let Ok(bytes) = icon_resp.bytes().await {
                let _ = fs::write(dir.join("icon.png"), &bytes);
            }
        }
    }

    let install_url = format!(
        "{}/agents/{}/install",
        store_api(),
        urlencoded(&req.agent_id)
    );
    let client = reqwest::Client::new();
    let _ = client.post(&install_url).send().await;

    Ok(())
}

pub fn sync_bundled_agent_instances(
    docs_dir: &Path,
    agents_dir: &Path,
    agent_id: &str,
) -> CoreResult<usize> {
    bundled::sync_bundled_agent_instances(docs_dir, agents_dir, agent_id)
}

pub fn uninstall_agent(agents_dir: &Path, agent_id: &str) -> CoreResult<()> {
    let dir = agents_dir.join(agent_id);
    if dir.exists() {
        fs::remove_dir_all(&dir)?;
    }
    Ok(())
}

pub async fn install_agent_from_github(agents_dir: &Path, github_url: &str) -> CoreResult<String> {
    let (owner, repo) = parse_github_ref(github_url)?;

    let config_bytes: Vec<u8> = fetch_github_raw(&owner, &repo, "houston.json")
        .await?
        .ok_or_else(|| CoreError::NotFound(format!("no houston.json in {owner}/{repo}")))?;

    let config: serde_json::Value = serde_json::from_slice(&config_bytes)?;
    let agent_id = config["id"]
        .as_str()
        .ok_or_else(|| CoreError::BadRequest("houston.json missing 'id' field".into()))?
        .to_string();

    let dir = agents_dir.join(&agent_id);
    fs::create_dir_all(&dir)?;
    fs::write(dir.join("houston.json"), &config_bytes)?;

    let (icon, claude_md) = tokio::join!(
        fetch_github_raw(&owner, &repo, "icon.png"),
        fetch_github_raw(&owner, &repo, "CLAUDE.md"),
    );

    if let Ok(Some(bytes)) = icon {
        let _ = fs::write(dir.join("icon.png"), &bytes);
    }
    if let Ok(Some(bytes)) = claude_md {
        let _ = fs::write(dir.join("CLAUDE.md"), &bytes);
    }

    let source = serde_json::json!({
        "repo": format!("{owner}/{repo}"),
        "installed_at": chrono::Utc::now().to_rfc3339(),
    });
    let _ = fs::write(
        dir.join(".source.json"),
        serde_json::to_string_pretty(&source).unwrap_or_default(),
    );

    tracing::info!("[store] installed agent from github: {owner}/{repo} -> {agent_id}");
    Ok(agent_id)
}

pub async fn check_agent_updates(agents_dir: &Path) -> CoreResult<Vec<String>> {
    if !agents_dir.exists() {
        return Ok(vec![]);
    }

    let mut updated = Vec::new();
    let bundled = bundled_catalog()?.unwrap_or_default();
    let entries = fs::read_dir(agents_dir)?;

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let source_path = path.join(".source.json");
        if !source_path.exists() {
            continue;
        }

        let source_str = fs::read_to_string(&source_path)?;
        let source: serde_json::Value = match serde_json::from_str(&source_str) {
            Ok(v) => v,
            Err(_) => continue,
        };
        if source["source"].as_str() == Some("houston-store") {
            let agent_id = match source["agent_id"].as_str() {
                Some(id) => id,
                None => continue,
            };
            let Some(listing) = bundled.iter().find(|l| l.id == agent_id) else {
                continue;
            };
            let local_hash = source["content_hash"].as_str();
            let remote_hash = listing.content_hash.as_deref();
            let local_version = source["version"].as_str();
            let remote_version = listing.version.as_deref();
            if local_hash == remote_hash && local_version == remote_version {
                continue;
            }
            install_bundled_agent(agents_dir, agent_id, Some(agent_id))?;
            updated.push(agent_id.to_string());
            continue;
        }

        let repo = match source["repo"].as_str() {
            Some(r) => r.to_string(),
            None => continue,
        };

        let parts: Vec<&str> = repo.split('/').collect();
        if parts.len() != 2 {
            continue;
        }
        let (owner, repo_name) = (parts[0], parts[1]);

        let local_config = fs::read_to_string(path.join("houston.json")).unwrap_or_default();
        let remote_config = match fetch_github_raw(owner, repo_name, "houston.json").await {
            Ok(Some(bytes)) => String::from_utf8_lossy(&bytes).to_string(),
            _ => continue,
        };

        let config_changed = local_config.trim() != remote_config.trim();

        if !config_changed {
            continue;
        }

        let _ = fs::write(path.join("houston.json"), &remote_config);
        if let Ok(Some(bytes)) = fetch_github_raw(owner, repo_name, "CLAUDE.md").await {
            let _ = fs::write(path.join("CLAUDE.md"), &bytes);
        }

        tracing::info!("[store] updated agent from {owner}/{repo_name}");
        updated.push(format!("{owner}/{repo_name}"));
    }

    Ok(updated)
}

/// Workspace template schema (`workspace.json` in a GitHub repo).
#[derive(Deserialize)]
struct WorkspaceTemplate {
    name: String,
    #[allow(dead_code)]
    description: Option<String>,
    agents: Vec<String>,
}

pub async fn install_workspace_from_github(
    docs_dir: &Path,
    agents_dir: &Path,
    github_url: &str,
) -> CoreResult<ImportedWorkspace> {
    let (owner, repo) = parse_github_ref(github_url)?;

    let ws_bytes = fetch_github_raw(&owner, &repo, "workspace.json")
        .await?
        .ok_or_else(|| CoreError::NotFound(format!("no workspace.json in {owner}/{repo}")))?;

    let template: WorkspaceTemplate = serde_json::from_slice(&ws_bytes)
        .map_err(|e| CoreError::BadRequest(format!("invalid workspace.json: {e}")))?;

    let existing: Vec<Workspace> = workspaces::read_all(docs_dir)?;
    let ws_name = if existing.iter().any(|w| w.name == template.name) {
        format!("{} (imported)", template.name)
    } else {
        template.name.clone()
    };

    let ws = workspaces::create(
        docs_dir,
        CreateWorkspace {
            name: ws_name.clone(),
        },
    )?;
    let ws_dir = docs_dir.join(&ws_name);

    let mut created_agent_ids: Vec<String> = Vec::new();

    for agent_folder in &template.agents {
        let prefix = format!("agents/{agent_folder}");
        let config_path = format!("{prefix}/houston.json");

        let config_bytes = match fetch_github_raw(&owner, &repo, &config_path).await {
            Ok(Some(bytes)) => bytes,
            _ => {
                tracing::warn!("[workspace-import] skipping {agent_folder}: no houston.json");
                continue;
            }
        };
        let config: serde_json::Value = match serde_json::from_slice(&config_bytes) {
            Ok(v) => v,
            Err(e) => {
                tracing::warn!("[workspace-import] skipping {agent_folder}: invalid JSON: {e}");
                continue;
            }
        };

        let agent_id = config["id"]
            .as_str()
            .unwrap_or(agent_folder.as_str())
            .to_string();

        let def_dir = agents_dir.join(&agent_id);
        fs::create_dir_all(&def_dir)?;
        fs::write(def_dir.join("houston.json"), &config_bytes)?;

        let claude_path_gh = format!("{prefix}/CLAUDE.md");
        let icon_path_gh = format!("{prefix}/icon.png");
        let (claude_md, icon) = tokio::join!(
            fetch_github_raw(&owner, &repo, &claude_path_gh),
            fetch_github_raw(&owner, &repo, &icon_path_gh),
        );

        if let Ok(Some(bytes)) = claude_md {
            let _ = fs::write(def_dir.join("CLAUDE.md"), &bytes);
        }
        if let Ok(Some(bytes)) = icon {
            let _ = fs::write(def_dir.join("icon.png"), &bytes);
        }

        let source = serde_json::json!({
            "repo": format!("{owner}/{repo}"),
            "subfolder": agent_folder,
            "installed_at": chrono::Utc::now().to_rfc3339(),
        });
        let _ = fs::write(
            def_dir.join(".source.json"),
            serde_json::to_string_pretty(&source).unwrap_or_default(),
        );

        let agent_name = config["name"]
            .as_str()
            .unwrap_or(agent_folder.as_str())
            .to_string();
        let agent_color = config["color"].as_str().map(|s| s.to_string());
        let agent_folder_path = ws_dir.join(&agent_name);
        if agent_folder_path.exists() {
            tracing::warn!(
                "[workspace-import] agent folder exists: {agent_name}, skipping instance"
            );
            continue;
        }

        fs::create_dir_all(agent_folder_path.join(".houston"))?;
        fs::create_dir_all(agent_folder_path.join(".agents/skills"))?;

        let meta = serde_json::json!({
            "id": uuid::Uuid::new_v4().to_string(),
            "config_id": agent_id,
            "color": agent_color,
            "created_at": chrono::Utc::now().to_rfc3339(),
            "last_opened_at": chrono::Utc::now().to_rfc3339(),
        });
        fs::write(
            agent_folder_path.join(".houston/agent.json"),
            serde_json::to_string_pretty(&meta)?,
        )?;

        let claude_target = agent_folder_path.join("CLAUDE.md");
        if !claude_target.exists() {
            let content = fs::read_to_string(def_dir.join("CLAUDE.md"))
                .ok()
                .or_else(|| config["claudeMd"].as_str().map(|s| s.to_string()))
                .unwrap_or_else(|| "## Instructions\n\n## Learnings\n".to_string());
            let _ = fs::write(&claude_target, content);
        }

        if let Some(seeds) = config["agentSeeds"].as_object() {
            for (rel, content) in seeds {
                if let Some(text) = content.as_str() {
                    let target = agent_folder_path.join(rel);
                    if !target.exists() {
                        if let Some(parent) = target.parent() {
                            let _ = fs::create_dir_all(parent);
                        }
                        let _ = fs::write(&target, text);
                    }
                }
            }
        }

        let houston = agent_folder_path.join(".houston");
        if !houston.join("activity.json").exists() {
            let _ = fs::write(houston.join("activity.json"), "[]");
        }
        if !houston.join("config.json").exists() {
            let _ = fs::write(houston.join("config.json"), "{}");
        }

        let _ = houston_agent_files::migrate_agent_data(&agent_folder_path);

        created_agent_ids.push(agent_id);
        tracing::info!("[workspace-import] created agent instance: {agent_name}");
    }

    tracing::info!(
        "[workspace-import] imported workspace '{}' from {owner}/{repo} ({} agents)",
        ws_name,
        created_agent_ids.len()
    );

    Ok(ImportedWorkspace {
        workspace_id: ws.id,
        workspace_name: ws_name,
        agent_ids: created_agent_ids,
    })
}

// -- helpers --

/// Parse a GitHub URL or "owner/repo" shorthand into `(owner, repo)`.
pub fn parse_github_ref(input: &str) -> CoreResult<(String, String)> {
    let trimmed = input.trim().trim_end_matches('/');
    if let Some(rest) = trimmed.strip_prefix("https://github.com/") {
        let parts: Vec<&str> = rest.splitn(3, '/').collect();
        if parts.len() >= 2 && !parts[0].is_empty() && !parts[1].is_empty() {
            return Ok((parts[0].to_string(), parts[1].to_string()));
        }
        return Err(CoreError::BadRequest(format!(
            "invalid GitHub URL: {input}"
        )));
    }
    let parts: Vec<&str> = trimmed.splitn(3, '/').collect();
    if parts.len() == 2 && !parts[0].is_empty() && !parts[1].is_empty() {
        return Ok((parts[0].to_string(), parts[1].to_string()));
    }
    Err(CoreError::BadRequest(format!(
        "expected 'owner/repo' or GitHub URL, got: {input}"
    )))
}

async fn fetch_github_raw(owner: &str, repo: &str, filename: &str) -> CoreResult<Option<Vec<u8>>> {
    let url = format!("https://raw.githubusercontent.com/{owner}/{repo}/main/{filename}");
    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("Cache-Control", "no-cache")
        .header("Pragma", "no-cache")
        .send()
        .await
        .map_err(net)?;
    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !resp.status().is_success() {
        return Err(CoreError::Internal(format!(
            "{filename} fetch returned {}",
            resp.status()
        )));
    }
    let body = resp.bytes().await.map_err(net)?;
    Ok(Some(body.to_vec()))
}

/// Default agents dir: `$HOME/.houston/agents`. Override via `HOUSTON_AGENTS_DIR`.
pub fn default_agents_dir() -> PathBuf {
    if let Ok(p) = std::env::var("HOUSTON_AGENTS_DIR") {
        return PathBuf::from(p);
    }
    let subdir = if cfg!(debug_assertions) {
        ".dev-houston"
    } else {
        ".houston"
    };
    dirs::home_dir()
        .map(|h| h.join(subdir).join("agents"))
        .unwrap_or_else(|| PathBuf::from(format!("{subdir}/agents")))
}

fn urlencoded(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            b' ' => out.push('+'),
            _ => {
                out.push('%');
                out.push(char::from(HEX[(b >> 4) as usize]));
                out.push(char::from(HEX[(b & 0x0f) as usize]));
            }
        }
    }
    out
}

const HEX: [u8; 16] = *b"0123456789ABCDEF";

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn parse_shorthand() {
        assert_eq!(
            parse_github_ref("gethouston/houston-store").unwrap(),
            ("gethouston".into(), "houston-store".into())
        );
    }

    #[test]
    fn parse_full_url() {
        assert_eq!(
            parse_github_ref("https://github.com/gethouston/houston-store").unwrap(),
            ("gethouston".into(), "houston-store".into())
        );
        assert_eq!(
            parse_github_ref("https://github.com/gethouston/houston-store/").unwrap(),
            ("gethouston".into(), "houston-store".into())
        );
        assert_eq!(
            parse_github_ref("https://github.com/gethouston/houston-store/tree/main").unwrap(),
            ("gethouston".into(), "houston-store".into())
        );
    }

    #[test]
    fn parse_rejects_garbage() {
        assert!(parse_github_ref("not a repo").is_err());
        assert!(parse_github_ref("").is_err());
        assert!(parse_github_ref("/").is_err());
    }

    #[test]
    fn uninstall_removes_dir() {
        let d = TempDir::new().unwrap();
        let a = d.path().join("my-agent");
        fs::create_dir_all(&a).unwrap();
        fs::write(a.join("houston.json"), "{}").unwrap();
        assert!(a.exists());
        uninstall_agent(d.path(), "my-agent").unwrap();
        assert!(!a.exists());
    }

    #[test]
    fn uninstall_missing_is_ok() {
        let d = TempDir::new().unwrap();
        uninstall_agent(d.path(), "ghost").unwrap();
    }

    #[test]
    fn urlencoded_basic() {
        assert_eq!(urlencoded("hello world"), "hello+world");
        assert_eq!(urlencoded("foo&bar=baz"), "foo%26bar%3Dbaz");
        assert_eq!(urlencoded("abc_123-xyz~.~"), "abc_123-xyz~.~");
    }
}
