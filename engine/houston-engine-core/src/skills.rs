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
/// Windows a real symlink needs Developer Mode or admin (os error 1314), so we
/// fall back to a **directory junction**: it needs no special privilege and,
/// unlike a copy, stays *live* — it always reflects the source `SKILL.md`, so a
/// skill the agent later rewrites can never go stale behind the mirror. A plain
/// copy is the last resort for the rare non-NTFS volume that rejects junctions.
///
/// Idempotent: skips when a node already exists at the link path.
fn ensure_claude_mirror(workspace_path: &str, skill_name: &str) {
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
    create_claude_mirror(workspace_path, skill_name, &link);
}

/// Build the discovery node at `link`. Split out so [`refresh_claude_mirror`]
/// can rebuild it after the source `SKILL.md` changes.
fn create_claude_mirror(workspace_path: &str, skill_name: &str, link: &Path) {
    #[cfg(unix)]
    {
        let _ = workspace_path;
        let target = Path::new("../../.agents/skills").join(skill_name);
        if let Err(e) = std::os::unix::fs::symlink(&target, link) {
            tracing::warn!("[skills] could not symlink {skill_name} into .claude: {e}");
        }
    }
    #[cfg(windows)]
    {
        // 1. Real symlink — relative, drift-free. Works only with Developer Mode
        //    or admin; otherwise CreateSymbolicLink fails with os error 1314.
        let rel = Path::new("..\\..\\.agents\\skills").join(skill_name);
        if std::os::windows::fs::symlink_dir(&rel, link).is_ok() {
            return;
        }
        // 2. Directory junction — the stock-Windows path. No privilege required,
        //    and it stays live (always reflects the source), so the agent never
        //    runs a stale copy of its own skill. Junctions need an ABSOLUTE target.
        let target = skills_dir(workspace_path).join(skill_name);
        match junction::create(&target, link) {
            Ok(()) => return,
            Err(e) => tracing::warn!(
                "[skills] junction for {skill_name} failed ({e}); copying as a last resort"
            ),
        }
        // 3. Copy — last resort for non-NTFS volumes that reject junctions. A
        //    point-in-time snapshot, rebuilt by `refresh_claude_mirror` on edit.
        if let Err(e) = crate::store::copy_dir_all(&target, link) {
            tracing::warn!("[skills] could not mirror {skill_name} into .claude: {e}");
        }
    }
}

/// Remove the `.claude/skills/{name}` discovery node — a symlink (Unix, or
/// Windows with Developer Mode), a directory junction (the Windows fallback), or
/// a copied directory (the non-NTFS last resort). A junction and a directory
/// symlink are detached with `remove_dir`, which drops the link **without
/// touching the source skill behind it**; only a real copied directory is
/// recursively deleted.
fn remove_claude_mirror(workspace_path: &str, skill_name: &str) {
    let root = expand_tilde(&PathBuf::from(workspace_path));
    let link = root.join(".claude/skills").join(skill_name);
    let Ok(meta) = link.symlink_metadata() else {
        return;
    };
    if let Err(e) = remove_mirror_node(&link, &meta) {
        tracing::warn!("[skills] could not remove {skill_name} from .claude: {e}");
    }
}

/// Detach a discovery node by its on-disk shape. A directory symlink and a
/// junction are both reparse points over a directory: `remove_dir` drops the
/// link itself and never follows through to the source.
#[cfg(windows)]
fn remove_mirror_node(link: &Path, meta: &std::fs::Metadata) -> std::io::Result<()> {
    if meta.is_symlink() || junction::exists(link).unwrap_or(false) {
        std::fs::remove_dir(link)
    } else if meta.is_dir() {
        std::fs::remove_dir_all(link)
    } else {
        std::fs::remove_file(link)
    }
}

#[cfg(not(windows))]
fn remove_mirror_node(link: &Path, meta: &std::fs::Metadata) -> std::io::Result<()> {
    if meta.is_symlink() {
        // remove_file detaches a symlink (file or directory) without touching
        // its target.
        std::fs::remove_file(link)
    } else if meta.is_dir() {
        std::fs::remove_dir_all(link)
    } else {
        std::fs::remove_file(link)
    }
}

/// Rebuild the Claude Code discovery mirror after a skill's content changes.
/// Symlinks and junctions are live, so this only does real work for the copied
/// last-resort fallback — and rebuilding unconditionally also upgrades any copy
/// left behind by an older Houston into a live junction the next time the user
/// edits the skill.
#[cfg(windows)]
fn refresh_claude_mirror(workspace_path: &str, skill_name: &str) {
    remove_claude_mirror(workspace_path, skill_name);
    ensure_claude_mirror(workspace_path, skill_name);
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
        ensure_claude_mirror(workspace_path, &s.name);
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
    ensure_claude_mirror(&req.workspace_path, &req.name);
    emit_skills_changed(events, &req.workspace_path);
    Ok(())
}

pub fn delete(events: &DynEventSink, workspace_path: &str, name: &str) -> CoreResult<()> {
    let dir = skills_dir(workspace_path);
    houston_skills::delete_skill(&dir, name)?;
    remove_claude_mirror(workspace_path, name);
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
        ensure_claude_mirror(&req.workspace_path, n);
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
    ensure_claude_mirror(&req.workspace_path, &name);
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

        assert!(d.path().join(".claude/skills/my-skill").symlink_metadata().is_ok());
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
        assert!(d.path().join(".claude/skills/gone").symlink_metadata().is_ok());
        delete(&events, &ws, "gone").unwrap();
        assert!(!d.path().join(".agents/skills/gone").exists());
        assert!(d.path().join(".claude/skills/gone").symlink_metadata().is_err());
    }

    #[test]
    fn mirror_reflects_source_edits() {
        // The `.claude/skills/<name>` discovery node must be a *live* link to the
        // source, not a point-in-time copy: a skill the agent later rewrites has
        // to stay in sync behind the mirror. Editing the source `SKILL.md` and
        // reading it back through the mirror proves the link is live. (On Windows
        // CI this exercises the symlink/junction path; a copy would fail here.)
        let d = TempDir::new().unwrap();
        let ws = d.path().to_string_lossy().to_string();
        let (events, _) = sink();
        create(
            &events,
            CreateSkillRequest {
                workspace_path: ws.clone(),
                name: "live".into(),
                description: "".into(),
                content: "original-body".into(),
            },
        )
        .unwrap();

        let source = d.path().join(".agents/skills/live/SKILL.md");
        let mut body = std::fs::read_to_string(&source).unwrap();
        body.push_str("\nEDITED-AFTER-INSTALL\n");
        std::fs::write(&source, body).unwrap();

        let through_mirror =
            std::fs::read_to_string(d.path().join(".claude/skills/live/SKILL.md")).unwrap();
        assert!(
            through_mirror.contains("EDITED-AFTER-INSTALL"),
            "mirror must reflect source edits (live link, not a stale copy)"
        );
    }

    #[cfg(windows)]
    #[test]
    fn windows_mirror_is_a_link_not_a_copy() {
        let d = TempDir::new().unwrap();
        let ws = d.path().to_string_lossy().to_string();
        let (events, _) = sink();
        create(
            &events,
            CreateSkillRequest {
                workspace_path: ws.clone(),
                name: "winlink".into(),
                description: "".into(),
                content: "body".into(),
            },
        )
        .unwrap();

        let link = d.path().join(".claude/skills/winlink");
        let is_symlink = link.symlink_metadata().unwrap().file_type().is_symlink();
        let is_junction = junction::exists(&link).unwrap_or(false);
        assert!(
            is_symlink || is_junction,
            "Windows discovery mirror must be a symlink or junction, never a plain copy"
        );
    }

    #[cfg(windows)]
    #[test]
    fn windows_removing_mirror_keeps_source() {
        let d = TempDir::new().unwrap();
        let ws = d.path().to_string_lossy().to_string();
        let (events, _) = sink();
        create(
            &events,
            CreateSkillRequest {
                workspace_path: ws.clone(),
                name: "winsafe".into(),
                description: "".into(),
                content: "body".into(),
            },
        )
        .unwrap();

        // Detaching the junction/symlink must not follow through and delete the
        // real skill behind it.
        remove_claude_mirror(&ws, "winsafe");
        assert!(
            d.path().join(".agents/skills/winsafe/SKILL.md").exists(),
            "removing the .claude mirror must not delete the source skill"
        );
        assert!(d
            .path()
            .join(".claude/skills/winsafe")
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
