//! Parse a `.houstonagent` byte payload back into [`Inventory`] +
//! [`Manifest`]. The reader is the trust boundary: it rejects path
//! traversal, absolute paths, oversized entries, and version drift.

use std::io::{Cursor, Read as _};
use std::path::{Component, Path};

use crate::inventory::{Inventory, InventorySkill, LearningEntry, RoutineEntry};
use crate::manifest::{Manifest, FORMAT_VERSION};
use crate::{PortableError, Result, MAX_DECOMPRESSED_BYTES, MAX_ENTRIES};

#[derive(Debug, Clone)]
pub struct ParsedPackage {
    pub manifest: Manifest,
    pub inventory: Inventory,
}

/// Decode a zip payload. The caller owns the bytes; this function never
/// touches the filesystem.
pub fn parse_package(bytes: &[u8]) -> Result<ParsedPackage> {
    let cursor = Cursor::new(bytes);
    let mut archive = zip::ZipArchive::new(cursor)?;

    if archive.len() > MAX_ENTRIES {
        return Err(PortableError::TooManyEntries);
    }

    let mut manifest: Option<Manifest> = None;
    let mut claude_md: Option<String> = None;
    let mut skills: Vec<InventorySkill> = Vec::new();
    let mut routines_raw: Option<String> = None;
    let mut learnings_raw: Option<String> = None;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        if entry.is_dir() {
            continue;
        }
        // Use `enclosed_name` so traversal/absolute paths are rejected by
        // the zip crate itself; then run our own component check for
        // defence in depth.
        let raw = entry.name().to_string();
        let safe = entry
            .enclosed_name()
            .ok_or_else(|| PortableError::UnsafePath(raw.clone()))?;
        validate_components(&safe).map_err(|_| PortableError::UnsafePath(raw.clone()))?;
        let name = safe.to_string_lossy().replace('\\', "/");

        if entry.size() > MAX_DECOMPRESSED_BYTES {
            return Err(PortableError::TooLarge(name));
        }

        let mut body = String::new();
        entry.read_to_string(&mut body)?;

        match name.as_str() {
            "manifest.json" => {
                let m: Manifest = serde_json::from_str(&body).map_err(|e| PortableError::Json {
                    entry: "manifest.json".into(),
                    source: e,
                })?;
                if m.format_version > FORMAT_VERSION {
                    return Err(PortableError::UnsupportedVersion {
                        found: m.format_version,
                        supported: FORMAT_VERSION,
                    });
                }
                manifest = Some(m);
            }
            "CLAUDE.md" => claude_md = Some(body),
            "routines.json" => routines_raw = Some(body),
            "learnings.json" => learnings_raw = Some(body),
            other if other.starts_with(".agents/skills/") && other.ends_with("/SKILL.md") => {
                let mid = &other[".agents/skills/".len()..other.len() - "/SKILL.md".len()];
                if mid.is_empty() || mid.contains('/') {
                    return Err(PortableError::UnsafePath(other.to_string()));
                }
                skills.push(InventorySkill {
                    slug: mid.to_string(),
                    skill_md: body,
                });
            }
            "icon.png" => {
                // Reserved for a future release; tolerated so an older Houston
                // doesn't choke on a package that ships an icon.
            }
            unknown => {
                tracing::warn!(entry = %unknown, "ignoring unexpected entry in portable agent package");
            }
        }
    }

    let manifest = manifest.ok_or_else(|| PortableError::MissingEntry("manifest.json".into()))?;
    let routines = match routines_raw {
        Some(s) => parse_json::<Vec<RoutineEntry>>(&s, "routines.json")?,
        None => Vec::new(),
    };
    let learnings = match learnings_raw {
        Some(s) => parse_json::<Vec<LearningEntry>>(&s, "learnings.json")?,
        None => Vec::new(),
    };

    // Stable ordering so the import preview UI is deterministic.
    skills.sort_by(|a, b| a.slug.cmp(&b.slug));

    Ok(ParsedPackage {
        manifest,
        inventory: Inventory {
            claude_md,
            skills,
            routines,
            learnings,
        },
    })
}

fn parse_json<T: serde::de::DeserializeOwned>(body: &str, entry: &str) -> Result<T> {
    serde_json::from_str(body).map_err(|e| PortableError::Json {
        entry: entry.into(),
        source: e,
    })
}

fn validate_components(p: &Path) -> std::result::Result<(), ()> {
    for c in p.components() {
        match c {
            Component::Normal(_) => {}
            Component::CurDir => {}
            Component::ParentDir | Component::Prefix(_) | Component::RootDir => return Err(()),
        }
    }
    Ok(())
}
