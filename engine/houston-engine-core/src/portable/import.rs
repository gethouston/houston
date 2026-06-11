//! Receive a `.houstonagent` package: parse, cache, preview, install.
//!
//! Flow:
//!   1. `register_upload` parses the zip, caches both raw bytes and the
//!      [`ParsedPackage`] keyed by a fresh `package_id`, returns the id.
//!   2. UI fetches preview / threat-scan / etc. against the cached state
//!      using the same id.
//!   3. `install` materialises the chosen items into a real agent folder
//!      under `<docs_dir>/<workspace>/<agent>`.
//!
//! The cache lives in-process with a 15-minute TTL. A second call to
//! `register_upload` with the same bytes returns a fresh id (the cache is
//! keyed by id, not content), which is fine for a sub-15-minute wizard.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use houston_agent_portable::{parse_package, Inventory, ParsedPackage};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::{CoreError, CoreResult};
use crate::portable::export::{build_preview, InventoryPreview};

const CACHE_TTL: Duration = Duration::from_secs(15 * 60);

struct CachedUpload {
    parsed: ParsedPackage,
    received_at: Instant,
}

static CACHE: Lazy<Mutex<HashMap<String, CachedUpload>>> = Lazy::new(|| Mutex::new(HashMap::new()));

fn evict_expired(cache: &mut HashMap<String, CachedUpload>) {
    let now = Instant::now();
    cache.retain(|_, v| now.duration_since(v.received_at) < CACHE_TTL);
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadPreviewResponse {
    pub package_id: String,
    pub manifest: ManifestSummary,
    pub preview: InventoryPreview,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestSummary {
    pub agent_id: String,
    pub agent_name: String,
    pub description: Option<String>,
    pub exporter: Option<String>,
    pub houston_version: String,
    pub created_at: String,
    pub anonymized: bool,
    pub format_version: u32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallRequest {
    pub package_id: String,
    pub workspace_name: String,
    pub agent_name: String,
    #[serde(default)]
    pub agent_color: Option<String>,
    pub selection: InstallSelection,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallSelection {
    /// CLAUDE.md is the agent's identity — always copied if the package
    /// has it. The UI does not expose a toggle for this. The field is
    /// here only so a future CLI client can opt out explicitly.
    #[serde(default = "default_true")]
    pub include_claude_md: bool,
    #[serde(default)]
    pub include_skill_slugs: Vec<String>,
    #[serde(default)]
    pub include_routine_ids: Vec<String>,
    #[serde(default)]
    pub include_learning_ids: Vec<String>,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledAgent {
    pub agent_path: String,
    pub agent_name: String,
    pub workspace_name: String,
    /// Composio toolkit slugs required by the installed items. The UI
    /// uses this for the final "connect missing integrations" screen.
    pub required_integrations: Vec<String>,
}

/// Decode the uploaded bytes, cache them under a fresh id, return the
/// preview-shaped response.
pub fn register_upload(bytes: &[u8]) -> CoreResult<UploadPreviewResponse> {
    let parsed = parse_package(bytes)
        .map_err(|e| CoreError::BadRequest(format!("not a valid .houstonagent file: {e}")))?;

    let package_id = Uuid::new_v4().to_string();
    let preview = build_preview(&parsed.inventory);
    let manifest = ManifestSummary {
        agent_id: parsed.manifest.agent_id.clone(),
        agent_name: parsed.manifest.agent_name.clone(),
        description: parsed.manifest.description.clone(),
        exporter: parsed.manifest.exporter.clone(),
        houston_version: parsed.manifest.houston_version.clone(),
        created_at: parsed.manifest.created_at.clone(),
        anonymized: parsed.manifest.anonymized,
        format_version: parsed.manifest.format_version,
    };

    let mut cache = CACHE.lock().expect("portable import cache poisoned");
    evict_expired(&mut cache);
    cache.insert(
        package_id.clone(),
        CachedUpload {
            parsed,
            received_at: Instant::now(),
        },
    );

    Ok(UploadPreviewResponse {
        package_id,
        manifest,
        preview,
    })
}

/// Look up a previously-uploaded package. Returns the parsed inventory so
/// downstream code (threat scan, install) can operate on it.
pub fn get_uploaded(package_id: &str) -> CoreResult<ParsedPackage> {
    let mut cache = CACHE.lock().expect("portable import cache poisoned");
    evict_expired(&mut cache);
    cache
        .get(package_id)
        .map(|c| c.parsed.clone())
        .ok_or_else(|| {
            CoreError::NotFound(
                "Upload not found or expired. Please re-upload the .houstonagent file.".into(),
            )
        })
}

/// Materialise the package contents into a real agent folder. Returns the
/// new agent path so the caller can navigate to it.
pub fn install(docs_dir: &Path, req: InstallRequest) -> CoreResult<InstalledAgent> {
    if req.workspace_name.trim().is_empty() {
        return Err(CoreError::BadRequest("workspace_name is required".into()));
    }
    if req.agent_name.trim().is_empty() {
        return Err(CoreError::BadRequest("agent_name is required".into()));
    }
    let parsed = get_uploaded(&req.package_id)?;

    let ws_dir = docs_dir.join(&req.workspace_name);
    if !ws_dir.exists() {
        return Err(CoreError::NotFound(format!(
            "workspace not found: {}",
            req.workspace_name
        )));
    }

    let agent_dir = pick_unique_agent_dir(&ws_dir, &req.agent_name)?;
    let final_agent_name = agent_dir
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(&req.agent_name)
        .to_string();

    std::fs::create_dir_all(agent_dir.join(".houston/routines"))?;
    std::fs::create_dir_all(agent_dir.join(".houston/learnings"))?;
    std::fs::create_dir_all(agent_dir.join(".agents/skills"))?;

    // The sidebar only lists directories with a valid `.houston/agent.json`.
    // Write it before anything else so a mid-flight crash leaves a half-
    // built agent that's still discoverable.
    let now = chrono::Utc::now().to_rfc3339();
    let agent_meta = serde_json::json!({
        "id": uuid::Uuid::new_v4().to_string(),
        "name": final_agent_name,
        // Point at the package's manifest agent_id. If the recipient has a
        // matching Houston Store install, they get the same tab layout
        // (board, files, etc). If not, the agent gracefully falls back to
        // a chat-only view — agent_configs lookup misses are non-fatal.
        "config_id": parsed.manifest.agent_id.clone(),
        "color": req.agent_color.clone(),
        "created_at": now,
        "last_opened_at": now,
    });
    std::fs::write(
        agent_dir.join(".houston/agent.json"),
        serde_json::to_string_pretty(&agent_meta)?,
    )?;

    let inventory = &parsed.inventory;

    // CLAUDE.md
    if req.selection.include_claude_md {
        if let Some(body) = inventory.claude_md.as_deref() {
            std::fs::write(agent_dir.join("CLAUDE.md"), body)?;
        }
    }

    // Skills — copy each SKILL.md verbatim into its own dir.
    let mut chosen_skills: Vec<&houston_agent_portable::InventorySkill> = inventory
        .skills
        .iter()
        .filter(|s| {
            req.selection
                .include_skill_slugs
                .iter()
                .any(|x| x == &s.slug)
        })
        .collect();
    chosen_skills.sort_by(|a, b| a.slug.cmp(&b.slug));

    for skill in &chosen_skills {
        let skill_dir = agent_dir.join(".agents/skills").join(&skill.slug);
        std::fs::create_dir_all(&skill_dir)?;
        std::fs::write(skill_dir.join("SKILL.md"), &skill.skill_md)?;
    }

    // Routines — filter, then write the JSON array.
    let chosen_routines: Vec<_> = inventory
        .routines
        .iter()
        .filter(|r| req.selection.include_routine_ids.iter().any(|x| x == &r.id))
        .cloned()
        .collect();
    let routines_json = serde_json::to_string_pretty(&chosen_routines)?;
    std::fs::write(
        agent_dir.join(".houston/routines/routines.json"),
        routines_json,
    )?;

    // Learnings — same shape.
    let chosen_learnings: Vec<_> = inventory
        .learnings
        .iter()
        .filter(|l| {
            req.selection
                .include_learning_ids
                .iter()
                .any(|x| x == &l.id)
        })
        .cloned()
        .collect();
    let learnings_json = serde_json::to_string_pretty(&chosen_learnings)?;
    std::fs::write(
        agent_dir.join(".houston/learnings/learnings.json"),
        learnings_json,
    )?;

    // Source provenance — non-load-bearing, useful for debugging.
    let source = serde_json::json!({
        "source": "from-a-friend",
        "exporter": parsed.manifest.exporter,
        "package_agent_id": parsed.manifest.agent_id,
        "package_houston_version": parsed.manifest.houston_version,
        "anonymized": parsed.manifest.anonymized,
        "installed_at": chrono::Utc::now().to_rfc3339(),
        "color": req.agent_color,
    });
    std::fs::write(
        agent_dir.join(".source.json"),
        serde_json::to_string_pretty(&source)?,
    )?;

    let required_integrations = aggregate_integrations(inventory, &req.selection, &chosen_routines);

    Ok(InstalledAgent {
        agent_path: agent_dir.to_string_lossy().to_string(),
        agent_name: final_agent_name,
        workspace_name: req.workspace_name,
        required_integrations,
    })
}

fn aggregate_integrations(
    inv: &Inventory,
    selection: &InstallSelection,
    chosen_routines: &[houston_agent_portable::RoutineEntry],
) -> Vec<String> {
    let mut set = std::collections::BTreeSet::new();
    for skill in &inv.skills {
        if !selection
            .include_skill_slugs
            .iter()
            .any(|x| x == &skill.slug)
        {
            continue;
        }
        if let Ok((summary, _)) = houston_skills::format::parse_content(&skill.skill_md) {
            for slug in summary.integrations {
                let s = slug.trim().to_lowercase();
                if !s.is_empty() {
                    set.insert(s);
                }
            }
        }
    }
    for r in chosen_routines {
        for slug in &r.integrations {
            let s = slug.trim().to_lowercase();
            if !s.is_empty() {
                set.insert(s);
            }
        }
    }
    set.into_iter().collect()
}

/// Find an unused agent folder name, suffixing `-2`, `-3`, ... on conflict.
/// Keeps the recipient's existing agent intact when a friend's package
/// names collide.
fn pick_unique_agent_dir(workspace_dir: &Path, base_name: &str) -> CoreResult<PathBuf> {
    let candidate = workspace_dir.join(base_name);
    if !candidate.exists() {
        return Ok(candidate);
    }
    for i in 2..=100 {
        let name = format!("{base_name}-{i}");
        let p = workspace_dir.join(&name);
        if !p.exists() {
            return Ok(p);
        }
    }
    Err(CoreError::Conflict(format!(
        "too many agents named {base_name:?}"
    )))
}
