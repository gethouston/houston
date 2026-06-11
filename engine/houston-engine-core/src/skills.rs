//! Skills CRUD + remote install — relocated from
//! `app/src-tauri/src/commands/skills.rs`.
//!
//! Transport-neutral: every function takes a workspace path (the agent's
//! on-disk root) plus, where mutations happen, a `DynEventSink` so that
//! HTTP routes, CLI tools, and the Tauri adapter all emit the same
//! `HoustonEvent::SkillsChanged` stream.

use crate::error::{CoreError, CoreResult};
use houston_skills::{
    self,
    remote::{CommunitySkill, RepoSkill},
    CreateSkillInput, SkillError,
};
use houston_ui_events::{DynEventSink, HoustonEvent};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

// ── DTOs ───────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SkillSummaryResponse {
    pub name: String,
    pub description: String,
    pub version: u32,
    pub tags: Vec<String>,
    pub created: Option<String>,
    pub last_used: Option<String>,
    pub category: Option<String>,
    pub featured: bool,
    pub integrations: Vec<String>,
    pub image: Option<String>,
    pub inputs: Vec<SkillInputResponse>,
    pub prompt_template: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SkillInputResponse {
    pub name: String,
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub placeholder: Option<String>,
    #[serde(rename = "type")]
    pub kind: String,
    pub required: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub options: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SkillDetailResponse {
    pub name: String,
    pub description: String,
    pub version: u32,
    pub content: String,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CreateSkillRequest {
    pub workspace_path: String,
    pub name: String,
    pub description: String,
    pub content: String,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SaveSkillRequest {
    pub workspace_path: String,
    pub content: String,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RepoSkillInput {
    pub id: String,
    pub name: String,
    pub description: String,
    pub path: String,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InstallFromRepoRequest {
    pub workspace_path: String,
    pub source: String,
    pub skills: Vec<RepoSkillInput>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InstallCommunityRequest {
    pub workspace_path: String,
    pub source: String,
    pub skill_id: String,
}

// ── Error mapping ──────────────────────────────────────────────────
//
// The `kind` strings here are part of the engine-client's typed error
// surface — UI matches on them to render plain-English copy. Keep in
// sync with `ui/skills/src/skill-error-kinds.ts`.

impl From<SkillError> for CoreError {
    fn from(err: SkillError) -> Self {
        use houston_engine_protocol::ErrorCode;
        match err {
            SkillError::NotFound(s) => CoreError::Labeled {
                code: ErrorCode::NotFound,
                kind: "skill_not_found",
                message: format!("Skill not found: {s}"),
            },
            SkillError::AlreadyExists(s) => CoreError::Labeled {
                code: ErrorCode::Conflict,
                kind: "already_installed",
                message: format!("'{s}' is already installed."),
            },
            SkillError::Validation(s) => CoreError::Labeled {
                code: ErrorCode::BadRequest,
                kind: "validation",
                message: s,
            },
            SkillError::Parse(s) => CoreError::Labeled {
                code: ErrorCode::BadRequest,
                kind: "parse_failed",
                message: s,
            },
            SkillError::SkillMalformed(s) => CoreError::Labeled {
                code: ErrorCode::BadRequest,
                kind: "skill_malformed",
                message: s,
            },
            SkillError::SkillNotInRepo(s) => CoreError::Labeled {
                code: ErrorCode::NotFound,
                kind: "skill_not_in_repo",
                message: s,
            },
            SkillError::PatchNotFound => CoreError::Labeled {
                code: ErrorCode::BadRequest,
                kind: "patch_not_found",
                message: "Patch target not found".into(),
            },
            SkillError::RateLimited(_) => CoreError::Labeled {
                code: ErrorCode::Unavailable,
                kind: "rate_limited",
                message: "Skills.sh is busy. Wait a moment and try again.".into(),
            },
            SkillError::Unavailable(_) => CoreError::Labeled {
                code: ErrorCode::Unavailable,
                kind: "offline",
                message: "Couldn't reach Skills.sh. Check your connection and try again.".into(),
            },
            SkillError::RepoPrivate => CoreError::Labeled {
                code: ErrorCode::Forbidden,
                kind: "repo_private",
                message: "That repo is private. Only public repos are supported.".into(),
            },
            SkillError::RepoNotFound(s) => CoreError::Labeled {
                code: ErrorCode::NotFound,
                kind: "repo_not_found",
                message: format!("Couldn't find a repo named '{s}'. Check the owner/repo."),
            },
            SkillError::RepoEmpty(s) => CoreError::Labeled {
                code: ErrorCode::BadRequest,
                kind: "repo_no_skills",
                message: format!("'{s}' has no SKILL.md files."),
            },
            SkillError::GithubRateLimited => CoreError::Labeled {
                code: ErrorCode::Unavailable,
                kind: "github_rate_limited",
                message: "GitHub is busy. Wait a moment and try again.".into(),
            },
            SkillError::Io(s) => CoreError::Internal(s),
        }
    }
}

// ── Helpers ────────────────────────────────────────────────────────

fn expand_tilde(path: &Path) -> PathBuf {
    // Cross-platform via `dirs::home_dir()` — Windows has no `$HOME`.
    if path.starts_with("~") {
        if let Some(home) = dirs::home_dir() {
            return home.join(path.strip_prefix("~").unwrap_or(path));
        }
    }
    path.to_path_buf()
}

fn skills_dir(workspace_path: &str) -> PathBuf {
    expand_tilde(&PathBuf::from(workspace_path)).join(".agents/skills")
}

/// Create `.claude/skills/{name}` so Claude Code discovers the skill natively.
///
/// On Unix this is a relative symlink to `../../.agents/skills/{name}`. On
/// Windows, symlink creation needs Developer Mode or admin (os error 1314), so
/// we try a directory symlink and, failing that, copy the skill directory —
/// the same "symlink, else copy" fallback the engine uses for agent role
/// files. The copy is kept current by [`refresh_claude_mirror`] on edit.
/// Idempotent: skips when the node already exists.
fn ensure_claude_symlink(workspace_path: &str, skill_name: &str) {
    let root = expand_tilde(&PathBuf::from(workspace_path));
    let claude_skills = root.join(".claude/skills");
    if let Err(e) = std::fs::create_dir_all(&claude_skills) {
        tracing::warn!("[skills] could not create .claude/skills dir: {e}");
        return;
    }
    let link = claude_skills.join(skill_name);
    if link.exists() {
        return;
    }
    #[cfg(unix)]
    {
        let target = Path::new("../../.agents/skills").join(skill_name);
        if let Err(e) = std::os::unix::fs::symlink(&target, &link) {
            tracing::warn!("[skills] could not symlink {skill_name} into .claude: {e}");
        }
    }
    #[cfg(windows)]
    {
        let target = Path::new("..\\..\\.agents\\skills").join(skill_name);
        if std::os::windows::fs::symlink_dir(&target, &link).is_err() {
            // No symlink privilege: copy so Claude Code still finds the skill.
            let source = skills_dir(workspace_path).join(skill_name);
            if let Err(e) = crate::store::copy_dir_all(&source, &link) {
                tracing::warn!("[skills] could not mirror {skill_name} into .claude: {e}");
            }
        }
    }
}

/// Remove the `.claude/skills/{name}` discovery node, whether it is a symlink
/// (Unix, or Windows with Developer Mode) or a copied directory (the Windows
/// fallback). Routes by node type because a Windows directory symlink must be
/// removed with `remove_dir`, not `remove_file`.
fn remove_claude_symlink(workspace_path: &str, skill_name: &str) {
    let root = expand_tilde(&PathBuf::from(workspace_path));
    let link = root.join(".claude/skills").join(skill_name);
    let Ok(meta) = link.symlink_metadata() else {
        return;
    };
    let ft = meta.file_type();
    let res = if ft.is_symlink() {
        remove_symlink_node(&link)
    } else if ft.is_dir() {
        std::fs::remove_dir_all(&link)
    } else {
        std::fs::remove_file(&link)
    };
    if let Err(e) = res {
        tracing::warn!("[skills] could not remove {skill_name} from .claude: {e}");
    }
}

/// Remove a symlink node. Windows directory symlinks need `remove_dir`;
/// everywhere else `remove_file` handles both file and directory symlinks.
fn remove_symlink_node(link: &Path) -> std::io::Result<()> {
    #[cfg(windows)]
    let r = std::fs::remove_dir(link);
    #[cfg(not(windows))]
    let r = std::fs::remove_file(link);
    r
}

/// Keep the Claude Code discovery mirror current after a skill's content
/// changes. On Unix the mirror is a live symlink, so there is nothing to do; on
/// Windows it may be a copy, so rebuild it.
#[cfg(windows)]
fn refresh_claude_mirror(workspace_path: &str, skill_name: &str) {
    remove_claude_symlink(workspace_path, skill_name);
    ensure_claude_symlink(workspace_path, skill_name);
}
#[cfg(not(windows))]
fn refresh_claude_mirror(_workspace_path: &str, _skill_name: &str) {}

fn emit_skills_changed(events: &DynEventSink, workspace_path: &str) {
    events.emit(HoustonEvent::SkillsChanged {
        agent_path: workspace_path.to_string(),
    });
}

// ── Public API ─────────────────────────────────────────────────────

pub fn list(workspace_path: &str) -> CoreResult<Vec<SkillSummaryResponse>> {
    let dir = skills_dir(workspace_path);
    let summaries = houston_skills::list_skills(&dir)?;
    for s in &summaries {
        ensure_claude_symlink(workspace_path, &s.name);
    }
    Ok(summaries
        .into_iter()
        .map(|s| SkillSummaryResponse {
            name: s.name,
            description: s.description,
            version: s.version,
            tags: s.tags,
            created: s.created,
            last_used: s.last_used,
            category: s.category,
            featured: s.featured,
            integrations: s.integrations,
            image: s.image,
            inputs: s
                .inputs
                .into_iter()
                .map(|i| SkillInputResponse {
                    name: i.name,
                    label: i.label,
                    placeholder: i.placeholder,
                    kind: match i.kind {
                        houston_skills::SkillInputKind::Text => "text".into(),
                        houston_skills::SkillInputKind::Textarea => "textarea".into(),
                        houston_skills::SkillInputKind::Select => "select".into(),
                    },
                    required: i.required,
                    default: i.default,
                    options: i.options,
                })
                .collect(),
            prompt_template: s.prompt_template,
        })
        .collect())
}

pub fn load(workspace_path: &str, name: &str) -> CoreResult<SkillDetailResponse> {
    let dir = skills_dir(workspace_path);
    let skill = houston_skills::load_skill(&dir, name)?;
    Ok(SkillDetailResponse {
        name: skill.summary.name,
        description: skill.summary.description,
        version: skill.summary.version,
        content: skill.content,
    })
}

pub fn create(events: &DynEventSink, req: CreateSkillRequest) -> CoreResult<()> {
    let dir = skills_dir(&req.workspace_path);
    std::fs::create_dir_all(&dir)?;
    houston_skills::create_skill(
        &dir,
        CreateSkillInput {
            name: req.name.clone(),
            description: req.description,
            content: req.content,
            tags: vec![],
        },
    )?;
    ensure_claude_symlink(&req.workspace_path, &req.name);
    emit_skills_changed(events, &req.workspace_path);
    Ok(())
}

pub fn delete(events: &DynEventSink, workspace_path: &str, name: &str) -> CoreResult<()> {
    let dir = skills_dir(workspace_path);
    houston_skills::delete_skill(&dir, name)?;
    remove_claude_symlink(workspace_path, name);
    emit_skills_changed(events, workspace_path);
    Ok(())
}

pub fn save(events: &DynEventSink, name: &str, req: SaveSkillRequest) -> CoreResult<()> {
    let dir = skills_dir(&req.workspace_path);
    houston_skills::edit_skill(&dir, name, &req.content)?;
    refresh_claude_mirror(&req.workspace_path, name);
    emit_skills_changed(events, &req.workspace_path);
    Ok(())
}

pub async fn list_from_repo(source: &str) -> CoreResult<Vec<RepoSkill>> {
    houston_skills::remote::list_skills_from_repo(source)
        .await
        .map_err(Into::into)
}

pub async fn install_from_repo(
    events: &DynEventSink,
    req: InstallFromRepoRequest,
) -> CoreResult<Vec<String>> {
    let dir = skills_dir(&req.workspace_path);
    let repo_skills: Vec<RepoSkill> = req
        .skills
        .into_iter()
        .map(|s| RepoSkill {
            id: s.id,
            name: s.name,
            description: s.description,
            path: s.path,
        })
        .collect();
    let names = houston_skills::remote::install_from_repo(&dir, &req.source, &repo_skills).await?;
    for n in &names {
        ensure_claude_symlink(&req.workspace_path, n);
    }
    emit_skills_changed(events, &req.workspace_path);
    Ok(names)
}

pub async fn search_community(query: &str) -> CoreResult<Vec<CommunitySkill>> {
    houston_skills::remote::search_skills(query)
        .await
        .map_err(Into::into)
}

/// Popular skills feed for the marketplace empty state. Backed by a
/// dedicated 24h cache slot so opening the dialog never blocks the
/// user's first search.
pub async fn popular_community() -> CoreResult<Vec<CommunitySkill>> {
    houston_skills::remote::fetch_popular_skills()
        .await
        .map_err(Into::into)
}

pub async fn install_community(
    events: &DynEventSink,
    req: InstallCommunityRequest,
) -> CoreResult<String> {
    let dir = skills_dir(&req.workspace_path);
    let name = houston_skills::remote::install_skill(&dir, &req.source, &req.skill_id).await?;
    ensure_claude_symlink(&req.workspace_path, &name);
    emit_skills_changed(events, &req.workspace_path);
    Ok(name)
}

#[cfg(test)]
mod tests {
    use super::*;
    use houston_ui_events::{BroadcastEventSink, DynEventSink};
    use std::sync::Arc;
    use tempfile::TempDir;

    fn sink() -> (DynEventSink, BroadcastEventSink) {
        let b = BroadcastEventSink::new(16);
        (Arc::new(b.clone()), b)
    }

    #[test]
    fn list_empty_when_missing() {
        let d = TempDir::new().unwrap();
        let ws = d.path().to_string_lossy().to_string();
        assert!(list(&ws).unwrap().is_empty());
    }

    #[tokio::test]
    async fn create_then_list_and_load() {
        let d = TempDir::new().unwrap();
        let ws = d.path().to_string_lossy().to_string();
        let (events, bcast) = sink();
        let mut rx = bcast.subscribe();

        create(
            &events,
            CreateSkillRequest {
                workspace_path: ws.clone(),
                name: "my-skill".into(),
                description: "Test".into(),
                content: "## Procedure\n\n1. Do stuff\n".into(),
            },
        )
        .unwrap();

        let ev = rx.recv().await.expect("SkillsChanged event");
        matches!(ev, HoustonEvent::SkillsChanged { .. });

        let all = list(&ws).unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].name, "my-skill");
        assert_eq!(all[0].version, 1);

        let loaded = load(&ws, "my-skill").unwrap();
        assert!(loaded.content.contains("Do stuff"));

        assert!(d
            .path()
            .join(".claude/skills/my-skill")
            .symlink_metadata()
            .is_ok());
    }

    #[test]
    fn create_duplicate_conflicts() {
        let d = TempDir::new().unwrap();
        let ws = d.path().to_string_lossy().to_string();
        let (events, _) = sink();
        create(
            &events,
            CreateSkillRequest {
                workspace_path: ws.clone(),
                name: "dup".into(),
                description: "".into(),
                content: "body".into(),
            },
        )
        .unwrap();
        let err = create(
            &events,
            CreateSkillRequest {
                workspace_path: ws.clone(),
                name: "dup".into(),
                description: "".into(),
                content: "body".into(),
            },
        )
        .unwrap_err();
        assert_eq!(err.code(), houston_engine_protocol::ErrorCode::Conflict);
        assert_eq!(err.kind(), Some("already_installed"));
    }

    #[test]
    fn save_increments_version_and_emits() {
        let d = TempDir::new().unwrap();
        let ws = d.path().to_string_lossy().to_string();
        let (events, _) = sink();
        create(
            &events,
            CreateSkillRequest {
                workspace_path: ws.clone(),
                name: "editable".into(),
                description: "".into(),
                content: "v1".into(),
            },
        )
        .unwrap();
        save(
            &events,
            "editable",
            SaveSkillRequest {
                workspace_path: ws.clone(),
                content: "v2".into(),
            },
        )
        .unwrap();
        let s = load(&ws, "editable").unwrap();
        assert_eq!(s.version, 2);
        assert!(s.content.contains("v2"));
    }

    #[test]
    fn delete_removes_symlink_and_dir() {
        let d = TempDir::new().unwrap();
        let ws = d.path().to_string_lossy().to_string();
        let (events, _) = sink();
        create(
            &events,
            CreateSkillRequest {
                workspace_path: ws.clone(),
                name: "gone".into(),
                description: "".into(),
                content: "body".into(),
            },
        )
        .unwrap();
        assert!(d
            .path()
            .join(".claude/skills/gone")
            .symlink_metadata()
            .is_ok());
        delete(&events, &ws, "gone").unwrap();
        assert!(!d.path().join(".agents/skills/gone").exists());
        assert!(d
            .path()
            .join(".claude/skills/gone")
            .symlink_metadata()
            .is_err());
    }

    #[test]
    fn load_missing_is_not_found() {
        let d = TempDir::new().unwrap();
        let ws = d.path().to_string_lossy().to_string();
        let err = load(&ws, "nope").unwrap_err();
        assert_eq!(err.code(), houston_engine_protocol::ErrorCode::NotFound);
        assert_eq!(err.kind(), Some("skill_not_found"));
    }
}
