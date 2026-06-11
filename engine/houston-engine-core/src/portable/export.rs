//! Build a portable agent package from an agent's on-disk state.
//!
//! Two-step UX:
//!   1. UI fetches an [`InventoryPreview`] so the user can decide which
//!      items to ship.
//!   2. UI posts an [`ExportRequest`] with the chosen ids (and optional
//!      anonymized override bodies); engine re-reads from disk, applies
//!      the selection + overrides, and returns the zip bytes.
//!
//! Re-reading from disk on the build step is intentional. The HTTP API
//! never accepts caller-supplied "this is what's in CLAUDE.md" — the
//! authoritative source is the file. Overrides are scoped, opt-in, and
//! limited to anonymize replacements.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;

use houston_agent_portable::{
    build_package as build_zip, Inventory, InventorySkill, LearningEntry as PortableLearning,
    ManifestMeta, Overrides as PortableOverrides, RoutineEntry as PortableRoutine,
    RoutineOverride as PortableRoutineOverride, Selection as PortableSelection,
};
use serde::{Deserialize, Serialize};

use crate::error::{CoreError, CoreResult};

const PREVIEW_EXCERPT_BYTES: usize = 280;
const PREVIEW_PROMPT_BYTES: usize = 240;

// ── Wire DTOs ───────────────────────────────────────────────────────────

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InventoryPreview {
    pub claude_md: Option<ClaudeMdPreview>,
    pub skills: Vec<SkillPreview>,
    pub routines: Vec<RoutinePreview>,
    pub learnings: Vec<LearningPreview>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeMdPreview {
    pub byte_count: usize,
    pub excerpt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillPreview {
    pub slug: String,
    pub description: String,
    pub category: Option<String>,
    pub image: Option<String>,
    pub integrations: Vec<String>,
    pub featured: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutinePreview {
    pub id: String,
    pub name: String,
    pub description: String,
    /// Truncated prompt for picker rows. Full body lives on disk; the
    /// writer reads it from there at package time.
    pub prompt_excerpt: String,
    pub schedule: String,
    pub enabled: bool,
    pub integrations: Vec<String>,
    pub timezone: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningPreview {
    pub id: String,
    pub text: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportRequest {
    pub selection: ExportSelection,
    #[serde(default)]
    pub overrides: ExportOverrides,
    pub meta: ExportMeta,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportSelection {
    #[serde(default)]
    pub include_claude_md: bool,
    #[serde(default)]
    pub include_skill_slugs: Vec<String>,
    #[serde(default)]
    pub include_routine_ids: Vec<String>,
    #[serde(default)]
    pub include_learning_ids: Vec<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportOverrides {
    #[serde(default)]
    pub claude_md: Option<String>,
    #[serde(default)]
    pub skill_bodies: HashMap<String, String>,
    #[serde(default)]
    pub routine_fields: HashMap<String, RoutineFieldOverride>,
    #[serde(default)]
    pub learning_texts: HashMap<String, String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutineFieldOverride {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub prompt: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportMeta {
    pub agent_id: String,
    pub agent_name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub exporter: Option<String>,
    #[serde(default)]
    pub anonymized: bool,
}

// ── Public API ──────────────────────────────────────────────────────────

/// Read every shareable surface from disk into a portable [`Inventory`].
///
/// Sessions, the chat DB, OS keychain entries, watcher state, mode
/// overlays, and any other `.houston/` state outside the four shareable
/// surfaces are intentionally NOT touched. This is the trust contract:
/// future contributors who add new agent state must explicitly extend
/// this function if and only if the surface is safe to share.
pub fn gather_inventory(agent_root: &Path) -> CoreResult<Inventory> {
    let claude_md = read_optional(&agent_root.join("CLAUDE.md"))?;
    let skills = gather_skills(agent_root)?;
    let routines = gather_routines(agent_root)?;
    let learnings = gather_learnings(agent_root)?;

    Ok(Inventory {
        claude_md,
        skills,
        routines,
        learnings,
    })
}

/// Build a UI-friendly preview from an [`Inventory`]. Skill frontmatter is
/// parsed so the picker can render description, category, integrations,
/// and the featured flag; prompts are truncated to keep payloads small.
pub fn build_preview(inv: &Inventory) -> InventoryPreview {
    let claude_md = inv.claude_md.as_deref().map(|body| ClaudeMdPreview {
        byte_count: body.len(),
        excerpt: excerpt(body, PREVIEW_EXCERPT_BYTES),
    });

    let skills = inv
        .skills
        .iter()
        .map(
            |s| match houston_skills::format::parse_content(&s.skill_md) {
                Ok((summary, _body)) => SkillPreview {
                    slug: s.slug.clone(),
                    description: summary.description,
                    category: summary.category,
                    image: summary.image,
                    integrations: summary.integrations,
                    featured: summary.featured,
                },
                Err(_) => SkillPreview {
                    slug: s.slug.clone(),
                    description: String::new(),
                    category: None,
                    image: None,
                    integrations: Vec::new(),
                    featured: false,
                },
            },
        )
        .collect();

    let routines = inv
        .routines
        .iter()
        .map(|r| RoutinePreview {
            id: r.id.clone(),
            name: r.name.clone(),
            description: r.description.clone(),
            prompt_excerpt: excerpt(&r.prompt, PREVIEW_PROMPT_BYTES),
            schedule: r.schedule.clone(),
            enabled: r.enabled,
            integrations: r.integrations.clone(),
            timezone: r.timezone.clone(),
        })
        .collect();

    let learnings = inv
        .learnings
        .iter()
        .map(|l| LearningPreview {
            id: l.id.clone(),
            text: l.text.clone(),
            created_at: l.created_at.clone(),
        })
        .collect();

    InventoryPreview {
        claude_md,
        skills,
        routines,
        learnings,
    }
}

/// End-to-end build: read inventory from disk, apply selection +
/// overrides, return zip bytes ready to be saved by the caller.
pub fn build_package(
    agent_root: &Path,
    houston_version: &str,
    req: ExportRequest,
) -> CoreResult<Vec<u8>> {
    let inventory = gather_inventory(agent_root)?;
    let selection = into_portable_selection(req.selection);
    let overrides = into_portable_overrides(req.overrides);
    let meta = ManifestMeta {
        agent_id: req.meta.agent_id,
        agent_name: req.meta.agent_name,
        description: req.meta.description,
        exporter: req.meta.exporter,
        houston_version: houston_version.to_string(),
        anonymized: req.meta.anonymized,
    };
    build_zip(&inventory, &selection, &overrides, meta)
        .map_err(|e| CoreError::Internal(format!("build package: {e}")))
}

// ── Helpers ─────────────────────────────────────────────────────────────

fn read_optional(path: &Path) -> CoreResult<Option<String>> {
    match fs::read_to_string(path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(CoreError::Internal(format!("read {}: {e}", path.display()))),
    }
}

fn gather_skills(agent_root: &Path) -> CoreResult<Vec<InventorySkill>> {
    let dir = agent_root.join(".agents/skills");
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    let entries =
        fs::read_dir(&dir).map_err(|e| CoreError::Internal(format!("read skills dir: {e}")))?;
    for entry in entries {
        let entry = entry.map_err(|e| CoreError::Internal(e.to_string()))?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let Some(slug) = path.file_name().and_then(|s| s.to_str()) else {
            continue;
        };
        let skill_md = path.join("SKILL.md");
        if !skill_md.exists() {
            continue;
        }
        let body = fs::read_to_string(&skill_md)
            .map_err(|e| CoreError::Internal(format!("read {}: {e}", skill_md.display())))?;
        out.push(InventorySkill {
            slug: slug.to_string(),
            skill_md: body,
        });
    }
    out.sort_by(|a, b| a.slug.cmp(&b.slug));
    Ok(out)
}

fn gather_routines(agent_root: &Path) -> CoreResult<Vec<PortableRoutine>> {
    let path = agent_root.join(".houston/routines/routines.json");
    let Some(raw) = read_optional(&path)? else {
        return Ok(Vec::new());
    };
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
    serde_json::from_str(trimmed).map_err(|e| {
        CoreError::Internal(format!(
            "parse routines.json: {e}. fix the file before sharing."
        ))
    })
}

fn gather_learnings(agent_root: &Path) -> CoreResult<Vec<PortableLearning>> {
    let path = agent_root.join(".houston/learnings/learnings.json");
    let Some(raw) = read_optional(&path)? else {
        return Ok(Vec::new());
    };
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
    serde_json::from_str(trimmed).map_err(|e| {
        CoreError::Internal(format!(
            "parse learnings.json: {e}. fix the file before sharing."
        ))
    })
}

fn into_portable_selection(sel: ExportSelection) -> PortableSelection {
    PortableSelection {
        include_claude_md: sel.include_claude_md,
        include_skill_slugs: sel.include_skill_slugs.into_iter().collect::<HashSet<_>>(),
        include_routine_ids: sel.include_routine_ids.into_iter().collect::<HashSet<_>>(),
        include_learning_ids: sel.include_learning_ids.into_iter().collect::<HashSet<_>>(),
    }
}

fn into_portable_overrides(ov: ExportOverrides) -> PortableOverrides {
    PortableOverrides {
        claude_md: ov.claude_md,
        skill_bodies: ov.skill_bodies,
        routine_fields: ov
            .routine_fields
            .into_iter()
            .map(|(id, v)| {
                (
                    id,
                    PortableRoutineOverride {
                        name: v.name,
                        description: v.description,
                        prompt: v.prompt,
                    },
                )
            })
            .collect(),
        learning_texts: ov.learning_texts,
    }
}

fn excerpt(body: &str, max_bytes: usize) -> String {
    if body.len() <= max_bytes {
        return body.to_string();
    }
    let mut cut = max_bytes;
    while cut > 0 && !body.is_char_boundary(cut) {
        cut -= 1;
    }
    let mut out = body[..cut].trim_end().to_string();
    out.push('…');
    out
}
