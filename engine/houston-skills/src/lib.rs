//! Hermes-style self-improving skills for AI agents.
//!
//! Skills are directories containing a `SKILL.md` file with frontmatter metadata
//! and a markdown body. Stored under `.agents/skills/<name>/SKILL.md` — the
//! skill.sh / Claude Code convention. A live `.claude/skills/<name>` link is
//! created alongside so Claude Code can discover skills natively (a symlink on
//! Unix; a directory junction on Windows without Developer Mode). The engine
//! owns that mirror — see `ensure_claude_mirror` in `houston-engine-core`.

pub mod format;
pub mod index;
pub mod patch;
#[cfg(feature = "remote")]
pub mod remote;
pub(crate) mod validate;

use serde::{Deserialize, Serialize};
use std::path::Path;
use thiserror::Error;

// ── Types ──────────────────────────────────────────────────────────

#[derive(Debug, Error)]
pub enum SkillError {
    #[error("IO error: {0}")]
    Io(String),
    #[error("Parse error: {0}")]
    Parse(String),
    #[error("Validation error: {0}")]
    Validation(String),
    #[error("Skill not found: {0}")]
    NotFound(String),
    #[error("Skill already exists: {0}")]
    AlreadyExists(String),
    #[error("Patch failed: old text not found")]
    PatchNotFound,
    #[error("Skills.sh is busy. Wait a moment and try again.")]
    RateLimited(String),
    #[error("Couldn't reach Skills.sh. Check your connection and try again.")]
    Unavailable(String),
    /// Skill source repo couldn't be parsed (bad SKILL.md, malformed
    /// frontmatter). Distinct from `Parse` so we can show an actionable
    /// message in the marketplace UI.
    #[error("This skill's file is malformed. Try a different one or contact the author.")]
    SkillMalformed(String),
    /// Skill source repo doesn't exist or doesn't include a SKILL.md at the
    /// expected path. Different from `NotFound` (which is local).
    #[error("Couldn't find that skill in the repo. The author may have renamed or removed it.")]
    SkillNotInRepo(String),
    /// The user's repo reference couldn't be parsed into an `owner/repo` —
    /// they pasted a whole command (`npx skills add ...`), a bare word, or
    /// free text. Distinct from `RepoNotFound` (a well-formed `owner/repo`
    /// GitHub simply doesn't have) so the UI can coach the format instead of
    /// implying the repo is missing, and so we never fire a doomed GitHub
    /// lookup on garbage. (HOU-440)
    #[error("Enter a GitHub repo as owner/repo, or paste its GitHub link.")]
    InvalidRepoSource(String),
    #[error("That repo is private. Only public repos are supported.")]
    RepoPrivate,
    #[error("Couldn't find a repo named '{0}'. Check the owner/repo.")]
    RepoNotFound(String),
    #[error("'{0}' has no SKILL.md files. The repo author needs to add one.")]
    RepoEmpty(String),
    #[error("GitHub is busy. Wait a moment and try again.")]
    GithubRateLimited,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillSummary {
    pub name: String,
    pub description: String,
    pub version: u32,
    pub tags: Vec<String>,
    pub created: Option<String>,
    pub last_used: Option<String>,
    /// Optional user-facing category (e.g. "Email", "Research"). Skills in
    /// the "new mission" picker are grouped by this value; those without one
    /// fall under "Other".
    pub category: Option<String>,
    /// Whether this skill should surface on the picker's Featured tab.
    /// Parsed from frontmatter `featured: yes|true|1`. Defaults to false.
    pub featured: bool,
    /// Composio toolkit slugs this skill uses (e.g. `["gmail", "slack"]`).
    /// Drives the logo row on skill cards so non-technical users can see
    /// which integrations a skill touches before running it.
    pub integrations: Vec<String>,
    /// Optional image. Either a full URL (e.g. an Unsplash photo) or a
    /// Microsoft Fluent 3D Emoji slug like `rocket` / `magnifying-glass-tilted-left`
    /// resolved by the frontend.
    pub image: Option<String>,
    /// Legacy declared user inputs for this action. Still parsed so older
    /// user-authored skills survive round-trips, but current Houston UX
    /// ignores these fields and keeps the free-text composer visible.
    pub inputs: Vec<SkillInput>,
    /// Legacy prompt template with `{{name}}` placeholders matching
    /// `inputs[].name`. Still parsed for compatibility, but current sends
    /// always use `Use the <skill> skill.` plus optional composer text.
    /// Multi-line YAML is supported via the `|` block scalar:
    ///
    /// ```yaml
    /// prompt_template: |
    ///   Research the company at {{company_url}}.
    ///   Focus areas: {{focus}}
    /// ```
    ///
    pub prompt_template: Option<String>,
}

/// Legacy declared input on a skill. Kept for parsing older files; new
/// Store-packaged skills should not declare inputs.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SkillInput {
    /// Variable name used inside legacy `prompt_template`. Required.
    pub name: String,
    /// User-facing label shown above the input (e.g. "Company to research").
    pub label: String,
    /// Optional placeholder text shown inside the field.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub placeholder: Option<String>,
    /// Field kind. Defaults to `text`.
    #[serde(default, rename = "type")]
    pub kind: SkillInputKind,
    /// Whether the field must be filled before "Start" is enabled.
    /// Defaults to `true` so authors only opt out explicitly.
    #[serde(default = "default_required")]
    pub required: bool,
    /// Optional default value the field starts populated with.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default: Option<String>,
    /// Choices for `kind: select`. Ignored for text/textarea kinds.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub options: Vec<String>,
}

fn default_required() -> bool {
    true
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SkillInputKind {
    /// Single-line text input.
    Text,
    /// Multi-line textarea for longer notes.
    Textarea,
    /// Dropdown selection from a fixed list of `options`.
    Select,
}

impl Default for SkillInputKind {
    fn default() -> Self {
        SkillInputKind::Text
    }
}

#[derive(Debug, Clone)]
pub struct Skill {
    pub summary: SkillSummary,
    pub content: String,
}

pub struct CreateSkillInput {
    pub name: String,
    pub description: String,
    pub content: String,
    pub tags: Vec<String>,
}

// ── Public API ─────────────────────────────────────────────────────

/// List all skills. Returns name + description only (progressive disclosure).
///
/// Auto-migrates any top-level `*.md` files into the canonical
/// `<name>/SKILL.md` directory layout before scanning, so users can drop a
/// flat markdown file into the skills directory and have it just work.
pub fn list_skills(skills_dir: &Path) -> Result<Vec<SkillSummary>, SkillError> {
    if !skills_dir.exists() {
        return Ok(Vec::new());
    }
    migrate_flat_files(skills_dir)?;
    let entries = std::fs::read_dir(skills_dir).map_err(|e| SkillError::Io(e.to_string()))?;
    let mut summaries = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let skill_md = path.join("SKILL.md");
        if !skill_md.exists() {
            continue;
        }
        match format::parse_file(&skill_md) {
            Ok((mut summary, _body)) => {
                // Identity = the on-disk directory slug. `load_skill`, `save`,
                // `delete`, and the `.claude` discovery mirror all resolve by
                // directory, so the name we hand back here is the one a caller
                // will pass to `load_skill`. A SKILL.md whose frontmatter `name:`
                // drifted from its directory (common for agent-authored skills
                // that carry a display phrase) must still round-trip — trust the
                // directory, not the frontmatter. (HOU-441)
                if let Some(dir_name) = path.file_name().and_then(|n| n.to_str()) {
                    summary.name = dir_name.to_string();
                }
                summaries.push(summary);
            }
            Err(e) => tracing::warn!("[houston-skills] skipping {}: {e}", path.display()),
        }
    }
    summaries.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(summaries)
}

/// Convert any top-level `<name>.md` files in `skills_dir` into the canonical
/// `<name>/SKILL.md` directory layout. Idempotent: skips files for which a
/// directory of the same stem already exists.
///
/// This lets users (or agents) drop a flat markdown skill file into
/// `.agents/skills/` and have Houston migrate it on the next list call.
fn migrate_flat_files(skills_dir: &Path) -> Result<(), SkillError> {
    let entries = std::fs::read_dir(skills_dir).map_err(|e| SkillError::Io(e.to_string()))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        // Skip dotfiles or hidden files
        if stem.starts_with('.') {
            continue;
        }
        let target_dir = skills_dir.join(stem);
        if target_dir.exists() {
            // A directory with this name already exists — leave the flat file
            // alone to avoid clobbering user data. Log and skip.
            tracing::warn!(
                "[houston-skills] skipping migration of {}: target {} exists",
                path.display(),
                target_dir.display()
            );
            continue;
        }
        std::fs::create_dir_all(&target_dir).map_err(|e| SkillError::Io(e.to_string()))?;
        let target = target_dir.join("SKILL.md");
        std::fs::rename(&path, &target).map_err(|e| SkillError::Io(e.to_string()))?;
        tracing::info!(
            "[houston-skills] migrated flat skill {} -> {}",
            path.display(),
            target.display()
        );
    }
    Ok(())
}

/// Load a skill's full content. Updates `last_used` in frontmatter.
pub fn load_skill(skills_dir: &Path, name: &str) -> Result<Skill, SkillError> {
    let skill_dir = skills_dir.join(name);
    let skill_md = skill_dir.join("SKILL.md");
    if !skill_md.exists() {
        return Err(SkillError::NotFound(name.to_string()));
    }
    let (mut summary, body) = format::parse_file(&skill_md)?;
    // Pin identity to the directory slug we were asked for. If the frontmatter
    // `name:` drifted from the directory (agent-authored skills often store a
    // display phrase here), heal it on open so the file, the `.claude` mirror,
    // and Claude Code's native tool name all agree with the slug everything
    // else loads by. `load_skill` already rewrites the file for `last_used`, so
    // this is free. (HOU-441)
    summary.name = name.to_string();
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    summary.last_used = Some(today);
    let updated = format::serialize(&summary, &body);
    std::fs::write(&skill_md, &updated).map_err(|e| SkillError::Io(e.to_string()))?;
    Ok(Skill {
        summary,
        content: body,
    })
}

/// Create a new skill directory with SKILL.md.
pub fn create_skill(skills_dir: &Path, input: CreateSkillInput) -> Result<(), SkillError> {
    validate::name(&input.name)?;
    validate::description(&input.description)?;
    validate::content(&input.content)?;

    let skill_dir = skills_dir.join(&input.name);
    if skill_dir.exists() {
        return Err(SkillError::AlreadyExists(input.name));
    }
    std::fs::create_dir_all(&skill_dir).map_err(|e| SkillError::Io(e.to_string()))?;

    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let summary = SkillSummary {
        name: input.name,
        description: input.description,
        version: 1,
        tags: input.tags,
        created: Some(today.clone()),
        last_used: Some(today),
        category: None,
        featured: false,
        integrations: Vec::new(),
        image: None,
        inputs: Vec::new(),
        prompt_template: None,
    };
    let content = format::serialize(&summary, &input.content);
    let skill_md = skill_dir.join("SKILL.md");
    std::fs::write(&skill_md, &content).map_err(|e| SkillError::Io(e.to_string()))?;
    Ok(())
}

/// Install a skill from a raw `SKILL.md` string, **preserving the author's
/// frontmatter** (description, category, integrations, image, inputs) instead
/// of rebuilding a bare one like [`create_skill`] does.
///
/// `install_name` becomes both the on-disk slug and the frontmatter `name`, so
/// the directory and the name always match. Bookkeeping is reset to a fresh
/// install (version 1, today's dates) and the skill is marked `featured` — the
/// user explicitly chose to install it, so it must surface on the chat empty
/// state and in the picker's Featured tab rather than hiding under "Other".
///
/// Falls back to a minimal skill (`fallback_description` + the raw body) when
/// the source has no parseable frontmatter, so a bare `SKILL.md` still installs
/// instead of failing.
pub fn install_skill_md(
    skills_dir: &Path,
    install_name: &str,
    raw_md: &str,
    fallback_description: &str,
) -> Result<(), SkillError> {
    validate::name(install_name)?;

    let skill_dir = skills_dir.join(install_name);
    if skill_dir.exists() {
        // Block reinstalling a healthy skill, but let a reinstall REPLACE one
        // whose SKILL.md is missing or unparseable (e.g. corrupted by an older
        // Houston) — otherwise the user is wedged: it never lists, yet a
        // reinstall reports "already installed".
        if format::parse_file(&skill_dir.join("SKILL.md")).is_ok() {
            return Err(SkillError::AlreadyExists(install_name.to_string()));
        }
        std::fs::remove_dir_all(&skill_dir).map_err(|e| SkillError::Io(e.to_string()))?;
    }

    let (mut summary, body) = match format::parse_content(raw_md) {
        Ok(parsed) => parsed,
        // No (or malformed) frontmatter: keep the whole document as the body.
        Err(_) => (
            blank_summary(install_name, fallback_description),
            raw_md.trim().to_string(),
        ),
    };

    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    summary.name = install_name.to_string();
    summary.version = 1;
    summary.created = Some(today.clone());
    summary.last_used = Some(today);
    summary.featured = true;
    if summary.description.trim().is_empty() {
        summary.description = fallback_description.to_string();
    }
    // Source descriptions can exceed our cap; clamp instead of failing the
    // install (matches the old lenient behavior).
    summary.description = clamp_len(&summary.description, validate::MAX_DESCRIPTION_LEN);

    validate::description(&summary.description)?;
    validate::content(&body)?;

    std::fs::create_dir_all(&skill_dir).map_err(|e| SkillError::Io(e.to_string()))?;
    let serialized = format::serialize(&summary, &body);
    std::fs::write(skill_dir.join("SKILL.md"), serialized).map_err(|e| SkillError::Io(e.to_string()))?;
    Ok(())
}

fn blank_summary(name: &str, description: &str) -> SkillSummary {
    SkillSummary {
        name: name.to_string(),
        description: description.to_string(),
        version: 1,
        tags: Vec::new(),
        created: None,
        last_used: None,
        category: None,
        featured: false,
        integrations: Vec::new(),
        image: None,
        inputs: Vec::new(),
        prompt_template: None,
    }
}

/// Truncate `s` to at most `max` bytes on a UTF-8 char boundary.
fn clamp_len(s: &str, max: usize) -> String {
    if s.len() <= max {
        return s.to_string();
    }
    let mut end = max;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    s[..end].trim_end().to_string()
}

/// Fuzzy find-and-replace within a skill's content. Increments version.
pub fn patch_skill(
    skills_dir: &Path,
    name: &str,
    old_text: &str,
    new_text: &str,
) -> Result<(), SkillError> {
    let skill_md = skills_dir.join(name).join("SKILL.md");
    if !skill_md.exists() {
        return Err(SkillError::NotFound(name.to_string()));
    }
    let (mut summary, body) = format::parse_file(&skill_md)?;
    let patched_body = patch::fuzzy_replace(&body, old_text, new_text)
        .ok_or(SkillError::PatchNotFound)?;
    validate::content(&patched_body)?;
    summary.version += 1;
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    summary.last_used = Some(today);
    let content = format::serialize(&summary, &patched_body);
    std::fs::write(&skill_md, &content).map_err(|e| SkillError::Io(e.to_string()))?;
    Ok(())
}

/// Full rewrite of skill content (preserves frontmatter metadata, increments version).
pub fn edit_skill(skills_dir: &Path, name: &str, new_content: &str) -> Result<(), SkillError> {
    validate::content(new_content)?;
    let skill_md = skills_dir.join(name).join("SKILL.md");
    if !skill_md.exists() {
        return Err(SkillError::NotFound(name.to_string()));
    }
    let (mut summary, _old_body) = format::parse_file(&skill_md)?;
    summary.version += 1;
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    summary.last_used = Some(today);
    let content = format::serialize(&summary, new_content);
    std::fs::write(&skill_md, &content).map_err(|e| SkillError::Io(e.to_string()))?;
    Ok(())
}

/// Delete a skill (removes entire directory). Idempotent — returns Ok if already gone.
pub fn delete_skill(skills_dir: &Path, name: &str) -> Result<(), SkillError> {
    let skill_dir = skills_dir.join(name);
    if !skill_dir.exists() {
        return Ok(());
    }
    std::fs::remove_dir_all(&skill_dir).map_err(|e| SkillError::Io(e.to_string()))?;
    Ok(())
}

/// Build compact skills index for system prompt injection.
pub fn build_skills_index(skills_dir: &Path) -> Result<String, SkillError> {
    index::build(skills_dir)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn list_empty_dir() {
        let tmp = TempDir::new().unwrap();
        let result = list_skills(tmp.path()).unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn list_nonexistent_dir() {
        let result = list_skills(Path::new("/nonexistent/path/skills"));
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[test]
    fn create_and_list() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path();
        create_skill(dir, CreateSkillInput {
            name: "my-skill".into(),
            description: "Test skill".into(),
            content: "## Procedure\n\n1. Do stuff\n".into(),
            tags: vec!["test".into()],
        }).unwrap();

        let skills = list_skills(dir).unwrap();
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].name, "my-skill");
        assert_eq!(skills[0].version, 1);
    }

    #[test]
    fn create_and_load() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path();
        create_skill(dir, CreateSkillInput {
            name: "loader-test".into(),
            description: "Load test".into(),
            content: "## Procedure\nTest body".into(),
            tags: vec![],
        }).unwrap();

        let skill = load_skill(dir, "loader-test").unwrap();
        assert_eq!(skill.summary.name, "loader-test");
        assert!(skill.content.contains("Test body"));
    }

    #[test]
    fn list_and_load_use_directory_slug_when_frontmatter_name_drifts() {
        // HOU-441: an agent-authored SKILL.md can carry a display phrase in its
        // frontmatter `name:` while living in a kebab-slug directory. `list_skills`
        // must report the *directory* slug — the id `load_skill` resolves by — or
        // the UI round-trip (list -> click -> load) hard-errors "Skill not found".
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path();
        let slug = "redactar-outreach-esg";
        let skill_dir = dir.join(slug);
        std::fs::create_dir_all(&skill_dir).unwrap();
        std::fs::write(
            skill_dir.join("SKILL.md"),
            "---\nname: Redactar Outreach ESG\ndescription: Draft ESG outreach\n---\n\n## Procedure\nDraft it.\n",
        )
        .unwrap();

        // list reports the directory slug, not the drifted frontmatter phrase.
        let skills = list_skills(dir).unwrap();
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].name, slug);

        // The id `list_skills` handed back round-trips cleanly through `load_skill`.
        let loaded = load_skill(dir, &skills[0].name).unwrap();
        assert_eq!(loaded.summary.name, slug);
        assert!(loaded.content.contains("Draft it."));

        // Opening the skill heals the on-disk frontmatter name to the slug.
        let healed = std::fs::read_to_string(skill_dir.join("SKILL.md")).unwrap();
        assert!(healed.contains(&format!("name: {slug}")));
        assert!(!healed.contains("Redactar Outreach ESG"));

        // The drifted phrase never named a real directory — still NotFound.
        assert!(matches!(
            load_skill(dir, "Redactar Outreach ESG"),
            Err(SkillError::NotFound(_))
        ));
    }

    #[test]
    fn create_duplicate_fails() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path();
        create_skill(dir, CreateSkillInput {
            name: "dup".into(),
            description: "".into(),
            content: "body".into(),
            tags: vec![],
        }).unwrap();
        let result = create_skill(dir, CreateSkillInput {
            name: "dup".into(),
            description: "".into(),
            content: "body".into(),
            tags: vec![],
        });
        assert!(result.is_err());
    }

    #[test]
    fn edit_increments_version() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path();
        create_skill(dir, CreateSkillInput {
            name: "editable".into(),
            description: "Edit me".into(),
            content: "v1 content".into(),
            tags: vec![],
        }).unwrap();

        edit_skill(dir, "editable", "v2 content").unwrap();
        let skill = load_skill(dir, "editable").unwrap();
        assert_eq!(skill.summary.version, 2);
        assert!(skill.content.contains("v2 content"));
    }

    #[test]
    fn patch_fuzzy() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path();
        create_skill(dir, CreateSkillInput {
            name: "patchable".into(),
            description: "Patch me".into(),
            content: "1. First step\n2. Second step\n".into(),
            tags: vec![],
        }).unwrap();

        patch_skill(dir, "patchable", "Second step", "Updated step").unwrap();
        let skill = load_skill(dir, "patchable").unwrap();
        assert!(skill.content.contains("Updated step"));
        assert!(!skill.content.contains("Second step"));
        assert_eq!(skill.summary.version, 2);
    }

    #[test]
    fn delete_removes_dir() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path();
        create_skill(dir, CreateSkillInput {
            name: "deleteme".into(),
            description: "".into(),
            content: "body".into(),
            tags: vec![],
        }).unwrap();
        assert!(dir.join("deleteme").exists());
        delete_skill(dir, "deleteme").unwrap();
        assert!(!dir.join("deleteme").exists());
    }

    #[test]
    fn delete_nonexistent_is_idempotent() {
        let tmp = TempDir::new().unwrap();
        let result = delete_skill(tmp.path(), "nope");
        assert!(result.is_ok());
    }

    #[test]
    fn list_migrates_flat_md_files() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path();
        // Drop a flat skill file with valid SKILL.md frontmatter
        let flat = dir.join("research.md");
        std::fs::write(
            &flat,
            "---\nname: research\ndescription: do research\nversion: 1\ntags: []\n---\n\n## Procedure\n\nResearch things\n",
        )
        .unwrap();

        let skills = list_skills(dir).unwrap();

        // Flat file should have been migrated and now appear in the listing
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].name, "research");
        assert!(!flat.exists(), "flat file should be moved");
        assert!(
            dir.join("research").join("SKILL.md").exists(),
            "directory layout should be created"
        );
    }

    #[test]
    fn migration_skips_when_directory_exists() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path();
        // Pre-existing skill directory
        create_skill(dir, CreateSkillInput {
            name: "shared".into(),
            description: "Original".into(),
            content: "body".into(),
            tags: vec![],
        }).unwrap();
        // Drop a conflicting flat file
        let flat = dir.join("shared.md");
        std::fs::write(&flat, "---\nname: shared\ndescription: clobber\nversion: 1\ntags: []\n---\n\nbody\n").unwrap();

        let _ = list_skills(dir).unwrap();

        // The flat file should be left alone (not silently overwriting the dir)
        assert!(flat.exists(), "flat file should not be removed when target dir exists");
    }

    #[test]
    fn install_md_preserves_frontmatter_and_features() {
        let d = TempDir::new().unwrap();
        let raw = "---\nname: original-slug\ndescription: Do the thing\ncategory: research\nimage: rocket\nintegrations: [tavily, gmail]\n---\n\n# Title\n\nBody here.\n";
        install_skill_md(d.path(), "writing-plans", raw, "fallback").unwrap();

        let (s, body) =
            format::parse_file(&d.path().join("writing-plans/SKILL.md")).unwrap();
        // The install slug owns the name, but the author's frontmatter survives.
        assert_eq!(s.name, "writing-plans");
        assert!(
            s.featured,
            "installed skills must be featured so the user can find what they installed"
        );
        assert_eq!(s.description, "Do the thing");
        assert_eq!(s.category.as_deref(), Some("research"));
        assert_eq!(s.image.as_deref(), Some("rocket"));
        assert_eq!(s.integrations, vec!["tavily", "gmail"]);
        assert_eq!(s.version, 1);
        assert!(body.contains("Body here."));

        // And it shows up in the list as a featured skill.
        let listed = list_skills(d.path()).unwrap();
        assert!(listed.iter().any(|x| x.name == "writing-plans" && x.featured));
    }

    #[test]
    fn install_md_without_frontmatter_uses_fallback() {
        let d = TempDir::new().unwrap();
        let raw = "# Just a heading\n\nNo frontmatter at all.\n";
        install_skill_md(d.path(), "bare-skill", raw, "fallback desc").unwrap();

        let (s, body) = format::parse_file(&d.path().join("bare-skill/SKILL.md")).unwrap();
        assert_eq!(s.name, "bare-skill");
        assert!(s.featured);
        assert_eq!(s.description, "fallback desc");
        assert!(body.contains("No frontmatter at all."));
    }

    #[test]
    fn install_md_clamps_overlong_description() {
        let d = TempDir::new().unwrap();
        let long = "x".repeat(400);
        let raw = format!("---\nname: s\ndescription: {long}\n---\n\nBody\n");
        // Must not fail validation on an over-long source description.
        install_skill_md(d.path(), "clamp-me", &raw, "fallback").unwrap();
        let (s, _) = format::parse_file(&d.path().join("clamp-me/SKILL.md")).unwrap();
        assert!(s.description.len() <= validate::MAX_DESCRIPTION_LEN);
    }

    #[test]
    fn install_md_colon_description_appears_in_list() {
        // Regression for the Vercel `ai-sdk` skill: its single-quoted, colon-laden
        // description used to serialize to invalid YAML, so the installed skill
        // was on disk but silently skipped by `list_skills`.
        let d = TempDir::new().unwrap();
        let raw = "---\nname: ai-sdk\ndescription: 'Use when developers: build agents, call generateText, or ask about \"streamText\"'\n---\n\n# AI SDK\n\nBody\n";
        install_skill_md(d.path(), "ai-sdk", raw, "fallback").unwrap();

        let listed = list_skills(d.path()).unwrap();
        assert!(
            listed.iter().any(|s| s.name == "ai-sdk"),
            "a skill whose description contains a colon must still appear in the list"
        );
    }

    #[test]
    fn install_md_overwrites_a_corrupt_existing_skill() {
        let d = TempDir::new().unwrap();
        // A skill left corrupt by an older Houston: unparseable SKILL.md.
        let dir = d.path().join("ai-sdk");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("SKILL.md"), "---\ndescription: broken: yaml\nno closing").unwrap();
        assert!(
            list_skills(d.path()).unwrap().is_empty(),
            "a corrupt skill should not list"
        );

        // Reinstalling heals it instead of erroring "already installed".
        let raw = "---\nname: ai-sdk\ndescription: Fresh and valid\n---\n\nBody\n";
        install_skill_md(d.path(), "ai-sdk", raw, "fallback").unwrap();
        let listed = list_skills(d.path()).unwrap();
        assert!(
            listed.iter().any(|s| s.name == "ai-sdk"),
            "reinstalling must heal a corrupt skill"
        );
    }

    #[test]
    fn install_md_rejects_a_healthy_existing_skill() {
        let d = TempDir::new().unwrap();
        let raw = "---\nname: dup\ndescription: ok\n---\n\nBody\n";
        install_skill_md(d.path(), "dup", raw, "f").unwrap();
        let err = install_skill_md(d.path(), "dup", raw, "f").unwrap_err();
        assert!(
            matches!(err, SkillError::AlreadyExists(_)),
            "a healthy skill must still block reinstall"
        );
    }
}
