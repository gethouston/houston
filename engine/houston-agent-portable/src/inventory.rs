//! The four kinds of content a portable agent can carry, plus the picker
//! (`Selection`) and the anonymize-result patch set (`Overrides`).

use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};

/// Full payload before any picker is applied. Built by the engine side from
/// the live agent on disk; reconstructed by the import side from the zip.
#[derive(Debug, Clone, Default)]
pub struct Inventory {
    pub claude_md: Option<String>,
    pub skills: Vec<InventorySkill>,
    pub routines: Vec<RoutineEntry>,
    pub learnings: Vec<LearningEntry>,
}

/// A single skill, carried verbatim as its on-disk `SKILL.md` body
/// (frontmatter + markdown procedure). The `slug` is the directory name.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InventorySkill {
    pub slug: String,
    pub skill_md: String,
}

/// Routine record. Mirrors `ui/agent-schemas/src/routines.schema.json` so it
/// round-trips through the package's `routines.json` array unchanged.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RoutineEntry {
    pub id: String,
    pub name: String,
    pub description: String,
    pub prompt: String,
    pub schedule: String,
    pub enabled: bool,
    pub suppress_when_silent: bool,
    /// Composio toolkit slugs the routine needs. Carried across share so the
    /// importer can show "Connect X / Y" before enabling the routine. Defaults
    /// to `[]` for routines authored before this field existed.
    #[serde(default)]
    pub integrations: Vec<String>,
    /// Sender's tz intent. Carried so an "every weekday 9am Bogota" routine
    /// stays that on the recipient's machine until they choose otherwise.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timezone: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Learning record. Mirrors `ui/agent-schemas/src/learnings.schema.json`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LearningEntry {
    pub id: String,
    pub text: String,
    pub created_at: String,
}

/// Per-item include / exclude. Built by the export wizard UI from user
/// checkbox state and passed to `build_package`. Defaults to "include
/// everything" via [`Selection::all_of`].
#[derive(Debug, Clone, Default)]
pub struct Selection {
    pub include_claude_md: bool,
    pub include_skill_slugs: HashSet<String>,
    pub include_routine_ids: HashSet<String>,
    pub include_learning_ids: HashSet<String>,
}

impl Selection {
    /// Default-include-all derived from a full [`Inventory`]. The UI starts
    /// in this state and the user un-ticks what they don't want to share.
    pub fn all_of(inv: &Inventory) -> Self {
        Selection {
            include_claude_md: inv.claude_md.is_some(),
            include_skill_slugs: inv.skills.iter().map(|s| s.slug.clone()).collect(),
            include_routine_ids: inv.routines.iter().map(|r| r.id.clone()).collect(),
            include_learning_ids: inv.learnings.iter().map(|l| l.id.clone()).collect(),
        }
    }
}

/// Anonymized replacements, keyed the same way the [`Selection`] is. When
/// `build_package` writes an item, it consults the override map first and
/// falls back to the original body if no entry exists.
#[derive(Debug, Clone, Default)]
pub struct Overrides {
    pub claude_md: Option<String>,
    pub skill_bodies: HashMap<String, String>,
    pub routine_fields: HashMap<String, RoutineOverride>,
    pub learning_texts: HashMap<String, String>,
}

#[derive(Debug, Clone, Default)]
pub struct RoutineOverride {
    pub name: Option<String>,
    pub description: Option<String>,
    pub prompt: Option<String>,
}

impl RoutineEntry {
    /// Apply non-None override fields, returning the patched routine. Used
    /// by `build_package` to materialise the anonymized variant before it
    /// lands in `routines.json`.
    pub fn with_override(mut self, ov: &RoutineOverride) -> Self {
        if let Some(v) = ov.name.as_ref() {
            self.name = v.clone();
        }
        if let Some(v) = ov.description.as_ref() {
            self.description = v.clone();
        }
        if let Some(v) = ov.prompt.as_ref() {
            self.prompt = v.clone();
        }
        self
    }
}

impl Inventory {
    /// Realise the inventory the writer will actually pack: filter by
    /// `selection`, then patch with `overrides`. Pure — does not touch
    /// disk.
    pub fn materialise(&self, selection: &Selection, overrides: &Overrides) -> Inventory {
        let claude_md = if selection.include_claude_md {
            overrides
                .claude_md
                .clone()
                .or_else(|| self.claude_md.clone())
        } else {
            None
        };

        let skills = self
            .skills
            .iter()
            .filter(|s| selection.include_skill_slugs.contains(&s.slug))
            .map(|s| InventorySkill {
                slug: s.slug.clone(),
                skill_md: overrides
                    .skill_bodies
                    .get(&s.slug)
                    .cloned()
                    .unwrap_or_else(|| s.skill_md.clone()),
            })
            .collect();

        let routines = self
            .routines
            .iter()
            .filter(|r| selection.include_routine_ids.contains(&r.id))
            .map(|r| match overrides.routine_fields.get(&r.id) {
                Some(ov) => r.clone().with_override(ov),
                None => r.clone(),
            })
            .collect();

        let learnings = self
            .learnings
            .iter()
            .filter(|l| selection.include_learning_ids.contains(&l.id))
            .map(|l| LearningEntry {
                id: l.id.clone(),
                text: overrides
                    .learning_texts
                    .get(&l.id)
                    .cloned()
                    .unwrap_or_else(|| l.text.clone()),
                created_at: l.created_at.clone(),
            })
            .collect();

        Inventory {
            claude_md,
            skills,
            routines,
            learnings,
        }
    }
}
