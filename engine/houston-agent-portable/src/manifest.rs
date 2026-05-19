//! Manifest written at `manifest.json` inside every `.houstonagent` zip.

use serde::{Deserialize, Serialize};

/// Bump when the on-disk layout changes in a way older Houston builds
/// cannot read. Adding optional fields does NOT require a bump.
pub const FORMAT_VERSION: u32 = 1;

/// Information about a package that does not derive from the inventory.
/// Callers supply this when building a package; the writer copies it into
/// `manifest.json` verbatim.
#[derive(Debug, Clone)]
pub struct ManifestMeta {
    /// Stable id of the source agent (matches `houston.json` `id`). Used on
    /// the import side for collision detection, never as a trust signal.
    pub agent_id: String,
    /// Human-readable name (e.g. "Personal Assistant"). Shown in the import
    /// preview before any item is installed.
    pub agent_name: String,
    /// Optional one-line description, surfaced in the preview card.
    pub description: Option<String>,
    /// Free-form exporter name (e.g. "Julian"). User-supplied at export time.
    /// Not authenticated.
    pub exporter: Option<String>,
    /// Houston version that produced the package, e.g. `"0.4.19"`. Aids
    /// debugging but is not used for compatibility decisions (that's what
    /// `format_version` is for).
    pub houston_version: String,
    /// True if the contents passed through the anonymize LLM pass. The
    /// importer sees this and can decide whether to still run a scan.
    pub anonymized: bool,
}

/// What ends up in `manifest.json`. Forwards-compatible: future Houston
/// builds may add fields, but the four counts and `format_version` are
/// load-bearing and must not be renamed.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Manifest {
    pub format_version: u32,
    pub agent_id: String,
    pub agent_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exporter: Option<String>,
    pub houston_version: String,
    pub created_at: String,
    pub anonymized: bool,
    pub counts: InventoryCounts,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct InventoryCounts {
    pub claude_md: u32,
    pub skills: u32,
    pub routines: u32,
    pub learnings: u32,
}

impl Manifest {
    /// Build a fresh manifest from caller-supplied meta + the realised
    /// inventory counts (after selection + overrides).
    pub fn new(meta: ManifestMeta, counts: InventoryCounts) -> Self {
        Manifest {
            format_version: FORMAT_VERSION,
            agent_id: meta.agent_id,
            agent_name: meta.agent_name,
            description: meta.description,
            exporter: meta.exporter,
            houston_version: meta.houston_version,
            created_at: chrono::Utc::now().to_rfc3339(),
            anonymized: meta.anonymized,
            counts,
        }
    }
}
