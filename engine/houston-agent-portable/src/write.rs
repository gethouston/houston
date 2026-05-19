//! Build a `.houstonagent` zip from a filtered inventory + manifest meta.

use std::io::{Cursor, Write as _};

use zip::write::SimpleFileOptions;
use zip::CompressionMethod;

use crate::inventory::{Inventory, Overrides, Selection};
use crate::manifest::{InventoryCounts, Manifest, ManifestMeta};
use crate::Result;

/// Produce a `.houstonagent` payload as a byte vector. The caller decides
/// where it lands (Tauri save dialog, HTTP response body, network upload).
///
/// `inventory` is the *full* inventory from disk. `selection` and
/// `overrides` are applied in-memory; nothing on disk changes.
pub fn build_package(
    inventory: &Inventory,
    selection: &Selection,
    overrides: &Overrides,
    meta: ManifestMeta,
) -> Result<Vec<u8>> {
    let realised = inventory.materialise(selection, overrides);

    let counts = InventoryCounts {
        claude_md: realised.claude_md.is_some() as u32,
        skills: realised.skills.len() as u32,
        routines: realised.routines.len() as u32,
        learnings: realised.learnings.len() as u32,
    };
    let manifest = Manifest::new(meta, counts);

    let mut buf = Vec::new();
    {
        let mut zip = zip::ZipWriter::new(Cursor::new(&mut buf));
        let opts = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

        let manifest_bytes = serde_json::to_vec_pretty(&manifest).map_err(|e| {
            crate::PortableError::Json {
                entry: "manifest.json".into(),
                source: e,
            }
        })?;
        zip.start_file("manifest.json", opts)?;
        zip.write_all(&manifest_bytes)?;

        if let Some(body) = realised.claude_md.as_deref() {
            zip.start_file("CLAUDE.md", opts)?;
            zip.write_all(body.as_bytes())?;
        }

        for skill in &realised.skills {
            let path = format!(".agents/skills/{}/SKILL.md", skill.slug);
            zip.start_file(path, opts)?;
            zip.write_all(skill.skill_md.as_bytes())?;
        }

        // Always write routines.json + learnings.json even when empty, so the
        // reader can rely on them existing and tell "empty" apart from
        // "missing / dropped on purpose".
        let routines_json = serde_json::to_vec_pretty(&realised.routines).map_err(|e| {
            crate::PortableError::Json {
                entry: "routines.json".into(),
                source: e,
            }
        })?;
        zip.start_file("routines.json", opts)?;
        zip.write_all(&routines_json)?;

        let learnings_json = serde_json::to_vec_pretty(&realised.learnings).map_err(|e| {
            crate::PortableError::Json {
                entry: "learnings.json".into(),
                source: e,
            }
        })?;
        zip.start_file("learnings.json", opts)?;
        zip.write_all(&learnings_json)?;

        zip.finish()?;
    }
    Ok(buf)
}
