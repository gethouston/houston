//! houston-agent-portable — the `.houstonagent` package format.
//!
//! A `.houstonagent` file is a zip with this layout:
//!
//! ```text
//! manifest.json
//! CLAUDE.md                          (optional)
//! .agents/skills/<slug>/SKILL.md     (zero or more)
//! routines.json                      (always present; may be `[]`)
//! learnings.json                     (always present; may be `[]`)
//! ```
//!
//! Sessions, chat DB, tokens, watchers, mode overlays, and any `.houston/`
//! state outside the four "shareable" surfaces are never written. The reader
//! refuses absolute paths, parent-dir traversal, and unexpected entries.
//!
//! The crate is intentionally provider-agnostic. The LLM-driven anonymize +
//! threat-scan passes live in sibling modules but accept trait objects, so
//! this crate has no Anthropic / OpenAI dependency.

pub mod inventory;
pub mod manifest;
pub mod read;
pub mod write;

#[cfg(test)]
mod tests;

use thiserror::Error;

pub use inventory::{
    Inventory, InventorySkill, LearningEntry, Overrides, RoutineEntry, RoutineOverride, Selection,
};
pub use manifest::{Manifest, ManifestMeta, FORMAT_VERSION};
pub use read::{parse_package, ParsedPackage};
pub use write::build_package;

/// Maximum decompressed size we will accept from a `.houstonagent` payload.
/// 64 MiB is enormously generous for prose + JSON; anything past it is a
/// zip bomb or a mistake.
pub const MAX_DECOMPRESSED_BYTES: u64 = 64 * 1024 * 1024;

/// Maximum number of entries we will read from a package.
pub const MAX_ENTRIES: usize = 4096;

#[derive(Debug, Error)]
pub enum PortableError {
    #[error("io error: {0}")]
    Io(String),
    #[error("zip error: {0}")]
    Zip(String),
    #[error("invalid manifest: {0}")]
    InvalidManifest(String),
    #[error("unsupported format version {found}; this Houston build supports up to {supported}")]
    UnsupportedVersion { found: u32, supported: u32 },
    #[error("missing required entry: {0}")]
    MissingEntry(String),
    #[error("entry path is unsafe: {0}")]
    UnsafePath(String),
    #[error("entry is too large: {0}")]
    TooLarge(String),
    #[error("too many entries in package (limit reached)")]
    TooManyEntries,
    #[error("json error in {entry}: {source}")]
    Json {
        entry: String,
        #[source]
        source: serde_json::Error,
    },
}

pub type Result<T> = std::result::Result<T, PortableError>;

impl From<std::io::Error> for PortableError {
    fn from(e: std::io::Error) -> Self {
        PortableError::Io(e.to_string())
    }
}

impl From<zip::result::ZipError> for PortableError {
    fn from(e: zip::result::ZipError) -> Self {
        PortableError::Zip(e.to_string())
    }
}
