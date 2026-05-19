//! Crate-level tests. Cover round-trip, selection + overrides, manifest
//! versioning, path traversal, oversized payloads, and entry limits.

use std::io::Write as _;

use zip::write::SimpleFileOptions;
use zip::CompressionMethod;

use crate::inventory::{
    Inventory, InventorySkill, LearningEntry, Overrides, RoutineEntry, RoutineOverride, Selection,
};
use crate::manifest::{ManifestMeta, FORMAT_VERSION};
use crate::{build_package, parse_package, PortableError};

fn meta() -> ManifestMeta {
    ManifestMeta {
        agent_id: "alice-research".into(),
        agent_name: "Alice's Research Agent".into(),
        description: Some("Tracks competitive intelligence.".into()),
        exporter: Some("Alice".into()),
        houston_version: "0.4.19".into(),
        anonymized: false,
    }
}

fn sample_inventory() -> Inventory {
    Inventory {
        claude_md: Some("# Job\nDo research.".into()),
        skills: vec![
            InventorySkill {
                slug: "research-company".into(),
                skill_md: "---\nname: research-company\ndescription: Deep dive\n---\nBody A".into(),
            },
            InventorySkill {
                slug: "draft-email".into(),
                skill_md: "---\nname: draft-email\ndescription: Drafts emails\n---\nBody B".into(),
            },
        ],
        routines: vec![RoutineEntry {
            id: "r1".into(),
            name: "Morning brief".into(),
            description: "Daily summary".into(),
            prompt: "Email Alice the digest.".into(),
            schedule: "0 9 * * 1-5".into(),
            enabled: true,
            suppress_when_silent: false,
            integrations: vec!["gmail".into(), "slack".into()],
            timezone: Some("America/Bogota".into()),
            created_at: "2026-05-15T09:00:00Z".into(),
            updated_at: "2026-05-15T09:00:00Z".into(),
        }],
        learnings: vec![
            LearningEntry {
                id: "l1".into(),
                text: "Alice prefers Stripe over Adyen.".into(),
                created_at: "2026-05-15T09:00:00Z".into(),
            },
            LearningEntry {
                id: "l2".into(),
                text: "Slack handle is @alice.".into(),
                created_at: "2026-05-15T09:00:00Z".into(),
            },
        ],
    }
}

#[test]
fn round_trip_all_items() {
    let inv = sample_inventory();
    let sel = Selection::all_of(&inv);
    let overrides = Overrides::default();
    let bytes = build_package(&inv, &sel, &overrides, meta()).unwrap();
    let parsed = parse_package(&bytes).unwrap();

    assert_eq!(parsed.manifest.format_version, FORMAT_VERSION);
    assert_eq!(parsed.manifest.agent_id, "alice-research");
    assert_eq!(parsed.manifest.counts.claude_md, 1);
    assert_eq!(parsed.manifest.counts.skills, 2);
    assert_eq!(parsed.manifest.counts.routines, 1);
    assert_eq!(parsed.manifest.counts.learnings, 2);
    assert!(!parsed.manifest.anonymized);

    assert_eq!(parsed.inventory.claude_md.as_deref(), Some("# Job\nDo research."));
    assert_eq!(parsed.inventory.skills.len(), 2);
    // Skills sorted by slug on read.
    assert_eq!(parsed.inventory.skills[0].slug, "draft-email");
    assert_eq!(parsed.inventory.skills[1].slug, "research-company");
    assert_eq!(parsed.inventory.routines, inv.routines);
    assert_eq!(parsed.inventory.routines[0].integrations, vec!["gmail", "slack"]);
    assert_eq!(
        parsed.inventory.routines[0].timezone.as_deref(),
        Some("America/Bogota")
    );
    assert_eq!(parsed.inventory.learnings, inv.learnings);
}

#[test]
fn selection_filters_items_out() {
    let inv = sample_inventory();
    let mut sel = Selection::all_of(&inv);
    sel.include_claude_md = false;
    sel.include_skill_slugs.remove("draft-email");
    sel.include_routine_ids.clear();
    sel.include_learning_ids.retain(|id| id == "l1");

    let bytes = build_package(&inv, &sel, &Overrides::default(), meta()).unwrap();
    let parsed = parse_package(&bytes).unwrap();

    assert!(parsed.inventory.claude_md.is_none());
    assert_eq!(parsed.inventory.skills.len(), 1);
    assert_eq!(parsed.inventory.skills[0].slug, "research-company");
    assert!(parsed.inventory.routines.is_empty());
    assert_eq!(parsed.inventory.learnings.len(), 1);
    assert_eq!(parsed.inventory.learnings[0].id, "l1");

    assert_eq!(parsed.manifest.counts.claude_md, 0);
    assert_eq!(parsed.manifest.counts.skills, 1);
    assert_eq!(parsed.manifest.counts.routines, 0);
    assert_eq!(parsed.manifest.counts.learnings, 1);
}

#[test]
fn overrides_replace_bodies_and_marks_anonymized() {
    let inv = sample_inventory();
    let sel = Selection::all_of(&inv);

    let mut overrides = Overrides::default();
    overrides.claude_md = Some("# Job\nDo research for <person>.".into());
    overrides
        .skill_bodies
        .insert("research-company".into(), "anonymized skill body".into());
    overrides.routine_fields.insert(
        "r1".into(),
        RoutineOverride {
            name: None,
            description: None,
            prompt: Some("Email <person> the digest.".into()),
        },
    );
    overrides
        .learning_texts
        .insert("l1".into(), "<person> prefers <payment-processor>.".into());

    let mut anon_meta = meta();
    anon_meta.anonymized = true;
    let bytes = build_package(&inv, &sel, &overrides, anon_meta).unwrap();
    let parsed = parse_package(&bytes).unwrap();

    assert!(parsed.manifest.anonymized);
    assert!(parsed
        .inventory
        .claude_md
        .as_deref()
        .unwrap()
        .contains("<person>"));
    let research = parsed
        .inventory
        .skills
        .iter()
        .find(|s| s.slug == "research-company")
        .unwrap();
    assert_eq!(research.skill_md, "anonymized skill body");
    assert!(parsed.inventory.routines[0].prompt.contains("<person>"));
    assert!(parsed.inventory.routines[0].name == "Morning brief"); // unchanged field
    let l1 = parsed
        .inventory
        .learnings
        .iter()
        .find(|l| l.id == "l1")
        .unwrap();
    assert!(l1.text.contains("<payment-processor>"));
}

#[test]
fn empty_inventory_still_round_trips() {
    let inv = Inventory::default();
    let sel = Selection::all_of(&inv);
    let bytes = build_package(&inv, &sel, &Overrides::default(), meta()).unwrap();
    let parsed = parse_package(&bytes).unwrap();
    assert!(parsed.inventory.claude_md.is_none());
    assert!(parsed.inventory.skills.is_empty());
    assert!(parsed.inventory.routines.is_empty());
    assert!(parsed.inventory.learnings.is_empty());
    assert_eq!(parsed.manifest.counts.skills, 0);
}

#[test]
fn future_format_version_is_rejected() {
    // Hand-roll a zip with manifest.format_version > FORMAT_VERSION.
    let mut buf = Vec::new();
    {
        let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));
        let opts = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        zip.start_file("manifest.json", opts).unwrap();
        let body = serde_json::json!({
            "format_version": FORMAT_VERSION + 99,
            "agent_id": "x",
            "agent_name": "X",
            "houston_version": "9.9.9",
            "created_at": "2099-01-01T00:00:00Z",
            "anonymized": false,
            "counts": { "claude_md": 0, "skills": 0, "routines": 0, "learnings": 0 }
        });
        zip.write_all(body.to_string().as_bytes()).unwrap();
        zip.start_file("routines.json", opts).unwrap();
        zip.write_all(b"[]").unwrap();
        zip.start_file("learnings.json", opts).unwrap();
        zip.write_all(b"[]").unwrap();
        zip.finish().unwrap();
    }
    let err = parse_package(&buf).unwrap_err();
    matches!(err, PortableError::UnsupportedVersion { .. });
}

#[test]
fn missing_manifest_is_rejected() {
    let mut buf = Vec::new();
    {
        let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));
        let opts = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        zip.start_file("CLAUDE.md", opts).unwrap();
        zip.write_all(b"hello").unwrap();
        zip.finish().unwrap();
    }
    let err = parse_package(&buf).unwrap_err();
    matches!(err, PortableError::MissingEntry(_));
}

#[test]
fn parent_dir_entry_is_rejected() {
    let mut buf = Vec::new();
    {
        let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));
        let opts = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        // valid manifest so we're not bailing out for the other reason
        zip.start_file("manifest.json", opts).unwrap();
        let body = serde_json::json!({
            "format_version": FORMAT_VERSION,
            "agent_id": "x",
            "agent_name": "X",
            "houston_version": "0.0.0",
            "created_at": "2026-01-01T00:00:00Z",
            "anonymized": false,
            "counts": { "claude_md": 0, "skills": 0, "routines": 0, "learnings": 0 }
        });
        zip.write_all(body.to_string().as_bytes()).unwrap();
        zip.start_file("../escape.txt", opts).unwrap();
        zip.write_all(b"pwn").unwrap();
        zip.finish().unwrap();
    }
    let err = parse_package(&buf).unwrap_err();
    matches!(err, PortableError::UnsafePath(_));
}

#[test]
fn unknown_entry_is_ignored_not_fatal() {
    // Forward-compat: a future Houston build may add new files; older
    // builds must skip them without breaking the import.
    let inv = sample_inventory();
    let sel = Selection::all_of(&inv);
    let mut bytes = build_package(&inv, &sel, &Overrides::default(), meta()).unwrap();

    // Append an unexpected entry by rebuilding the zip with one more file.
    let parsed = parse_package(&bytes).unwrap();
    drop(parsed);

    // Build a second zip that has an unknown entry alongside the real ones.
    let mut buf = Vec::new();
    {
        let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));
        let opts = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

        // Copy entries out of the original zip.
        let cur = std::io::Cursor::new(&mut bytes);
        let mut src = zip::ZipArchive::new(cur).unwrap();
        for i in 0..src.len() {
            let mut e = src.by_index(i).unwrap();
            let name = e.name().to_string();
            let mut body = String::new();
            e.read_to_string(&mut body).unwrap();
            zip.start_file(name, opts).unwrap();
            zip.write_all(body.as_bytes()).unwrap();
        }
        zip.start_file("future-thing.json", opts).unwrap();
        zip.write_all(br#"{"hello":"world"}"#).unwrap();
        zip.finish().unwrap();
    }
    let parsed = parse_package(&buf).unwrap();
    assert_eq!(parsed.inventory.skills.len(), 2);
}

#[test]
fn skill_path_with_nested_dir_is_rejected() {
    let mut buf = Vec::new();
    {
        let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));
        let opts = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        zip.start_file("manifest.json", opts).unwrap();
        let body = serde_json::json!({
            "format_version": FORMAT_VERSION,
            "agent_id": "x",
            "agent_name": "X",
            "houston_version": "0.0.0",
            "created_at": "2026-01-01T00:00:00Z",
            "anonymized": false,
            "counts": { "claude_md": 0, "skills": 0, "routines": 0, "learnings": 0 }
        });
        zip.write_all(body.to_string().as_bytes()).unwrap();
        zip.start_file(".agents/skills/evil/nested/SKILL.md", opts).unwrap();
        zip.write_all(b"body").unwrap();
        zip.finish().unwrap();
    }
    let err = parse_package(&buf).unwrap_err();
    matches!(err, PortableError::UnsafePath(_));
}

use std::io::Read as _;

#[test]
fn legacy_routine_without_integrations_field_parses() {
    // A package authored before integrations + timezone existed. The reader
    // must default both fields and not error out.
    let mut buf = Vec::new();
    {
        let mut zip = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));
        let opts = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        zip.start_file("manifest.json", opts).unwrap();
        let body = serde_json::json!({
            "format_version": FORMAT_VERSION,
            "agent_id": "x",
            "agent_name": "X",
            "houston_version": "0.0.0",
            "created_at": "2026-01-01T00:00:00Z",
            "anonymized": false,
            "counts": { "claude_md": 0, "skills": 0, "routines": 1, "learnings": 0 }
        });
        zip.write_all(body.to_string().as_bytes()).unwrap();
        zip.start_file("routines.json", opts).unwrap();
        let routines = serde_json::json!([{
            "id": "r1",
            "name": "Morning brief",
            "description": "Daily summary",
            "prompt": "...",
            "schedule": "0 9 * * 1-5",
            "enabled": true,
            "suppress_when_silent": false,
            "created_at": "2026-05-15T09:00:00Z",
            "updated_at": "2026-05-15T09:00:00Z"
        }]);
        zip.write_all(routines.to_string().as_bytes()).unwrap();
        zip.start_file("learnings.json", opts).unwrap();
        zip.write_all(b"[]").unwrap();
        zip.finish().unwrap();
    }

    let parsed = parse_package(&buf).unwrap();
    assert_eq!(parsed.inventory.routines.len(), 1);
    assert!(parsed.inventory.routines[0].integrations.is_empty());
    assert!(parsed.inventory.routines[0].timezone.is_none());
}
