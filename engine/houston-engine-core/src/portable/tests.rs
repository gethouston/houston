//! End-to-end tests for the export side: seed an agent, gather, preview,
//! build_package, parse the resulting zip back, and assert that sessions /
//! chat DB / tokens never appear in the output.

use std::fs;

use houston_agent_portable::parse_package;
use tempfile::TempDir;

use crate::portable::export::{
    build_package, build_preview, gather_inventory, ExportMeta, ExportOverrides, ExportRequest,
    ExportSelection, RoutineFieldOverride,
};

fn seed_agent(dir: &TempDir) {
    let root = dir.path();
    fs::create_dir_all(root.join(".houston/routines")).unwrap();
    fs::create_dir_all(root.join(".houston/learnings")).unwrap();
    fs::create_dir_all(root.join(".houston/sessions/anthropic")).unwrap();
    fs::create_dir_all(root.join(".agents/skills/research-company")).unwrap();
    fs::create_dir_all(root.join(".agents/skills/draft-email")).unwrap();

    fs::write(root.join("CLAUDE.md"), "# Job\nDo research for Alice.\n").unwrap();

    fs::write(
        root.join(".agents/skills/research-company/SKILL.md"),
        "---\nname: research-company\ndescription: Deep dive\nintegrations: [tavily]\ncategory: research\nfeatured: yes\n---\n\n## Procedure\nDo it.\n",
    )
    .unwrap();
    fs::write(
        root.join(".agents/skills/draft-email/SKILL.md"),
        "---\nname: draft-email\ndescription: Drafts emails\nintegrations: [gmail]\n---\n\n## Procedure\nDraft.\n",
    )
    .unwrap();

    let routines = serde_json::json!([{
        "id": "r1",
        "name": "Morning brief",
        "description": "Daily summary",
        "prompt": "Email Alice the digest.",
        "schedule": "0 9 * * 1-5",
        "enabled": true,
        "suppress_when_silent": false,
        "integrations": ["gmail", "slack"],
        "timezone": "America/Bogota",
        "created_at": "2026-05-15T09:00:00Z",
        "updated_at": "2026-05-15T09:00:00Z"
    }]);
    fs::write(
        root.join(".houston/routines/routines.json"),
        serde_json::to_string_pretty(&routines).unwrap(),
    )
    .unwrap();

    let learnings = serde_json::json!([
        { "id": "l1", "text": "Alice prefers Stripe.", "created_at": "2026-05-15T09:00:00Z" },
        { "id": "l2", "text": "Slack handle is @alice.", "created_at": "2026-05-15T09:00:00Z" }
    ]);
    fs::write(
        root.join(".houston/learnings/learnings.json"),
        serde_json::to_string_pretty(&learnings).unwrap(),
    )
    .unwrap();

    // Things that MUST NOT leak into the package:
    fs::write(
        root.join(".houston/sessions/anthropic/main.sid"),
        "secret-session-id",
    )
    .unwrap();
    fs::write(
        root.join(".houston/learnings/private-token.txt"),
        "sk-private-do-not-share",
    )
    .unwrap();
    fs::create_dir_all(root.join(".houston/prompts/modes")).unwrap();
    fs::write(
        root.join(".houston/prompts/modes/execution.md"),
        "user's private mode overlay",
    )
    .unwrap();
}

fn meta() -> ExportMeta {
    ExportMeta {
        agent_id: "alice".into(),
        agent_name: "Alice's Agent".into(),
        description: Some("Research helper.".into()),
        exporter: Some("Alice".into()),
        anonymized: false,
    }
}

#[test]
fn gather_inventory_picks_up_all_four_surfaces() {
    let dir = TempDir::new().unwrap();
    seed_agent(&dir);
    let inv = gather_inventory(dir.path()).unwrap();

    assert!(inv.claude_md.as_deref().unwrap().contains("Do research"));
    assert_eq!(inv.skills.len(), 2);
    assert_eq!(inv.skills[0].slug, "draft-email"); // sorted
    assert!(inv.skills[0].skill_md.contains("Drafts emails"));
    assert_eq!(inv.routines.len(), 1);
    assert_eq!(inv.routines[0].integrations, vec!["gmail", "slack"]);
    assert_eq!(inv.routines[0].timezone.as_deref(), Some("America/Bogota"));
    assert_eq!(inv.learnings.len(), 2);
}

#[test]
fn preview_extracts_skill_frontmatter() {
    let dir = TempDir::new().unwrap();
    seed_agent(&dir);
    let inv = gather_inventory(dir.path()).unwrap();
    let preview = build_preview(&inv);

    let research = preview
        .skills
        .iter()
        .find(|s| s.slug == "research-company")
        .unwrap();
    assert_eq!(research.description, "Deep dive");
    assert_eq!(research.category.as_deref(), Some("research"));
    assert!(research.featured);
    assert_eq!(research.integrations, vec!["tavily"]);

    let cm = preview.claude_md.as_ref().unwrap();
    assert!(cm.byte_count > 0);
    assert!(cm.excerpt.contains("Do research"));
}

#[test]
fn build_package_round_trips_and_excludes_sessions() {
    let dir = TempDir::new().unwrap();
    seed_agent(&dir);

    let req = ExportRequest {
        selection: ExportSelection {
            include_claude_md: true,
            include_skill_slugs: vec!["research-company".into(), "draft-email".into()],
            include_routine_ids: vec!["r1".into()],
            include_learning_ids: vec!["l1".into(), "l2".into()],
        },
        overrides: ExportOverrides::default(),
        meta: meta(),
    };
    let bytes = build_package(dir.path(), "0.4.19", req).unwrap();
    let parsed = parse_package(&bytes).unwrap();

    assert_eq!(parsed.manifest.counts.claude_md, 1);
    assert_eq!(parsed.manifest.counts.skills, 2);
    assert_eq!(parsed.manifest.counts.routines, 1);
    assert_eq!(parsed.manifest.counts.learnings, 2);
    assert_eq!(parsed.manifest.houston_version, "0.4.19");

    // The big one: nothing from sessions, prompts/modes, or random
    // files we dropped near the .houston tree should appear in the
    // package payload — neither the bytes themselves nor any reference
    // to their filenames.
    let payload = String::from_utf8_lossy(&bytes);
    assert!(!payload.contains("secret-session-id"));
    assert!(!payload.contains("private-token"));
    assert!(!payload.contains("sk-private"));
    assert!(!payload.contains("execution.md"));
    assert!(!payload.contains("private mode overlay"));

    // CLAUDE.md content lands on the recipient side.
    assert!(parsed
        .inventory
        .claude_md
        .as_deref()
        .unwrap()
        .contains("Do research"));
}

#[test]
fn anonymize_overrides_replace_bodies_and_set_flag() {
    let dir = TempDir::new().unwrap();
    seed_agent(&dir);

    let mut overrides = ExportOverrides::default();
    overrides.claude_md = Some("# Job\nDo research for <person>.\n".into());
    overrides.routine_fields.insert(
        "r1".into(),
        RoutineFieldOverride {
            prompt: Some("Email <person> the digest.".into()),
            ..Default::default()
        },
    );
    overrides
        .learning_texts
        .insert("l1".into(), "<person> prefers <payment-processor>.".into());

    let mut anon_meta = meta();
    anon_meta.anonymized = true;
    let req = ExportRequest {
        selection: ExportSelection {
            include_claude_md: true,
            include_skill_slugs: vec!["research-company".into()],
            include_routine_ids: vec!["r1".into()],
            include_learning_ids: vec!["l1".into()],
        },
        overrides,
        meta: anon_meta,
    };
    let bytes = build_package(dir.path(), "0.4.19", req).unwrap();
    let parsed = parse_package(&bytes).unwrap();

    assert!(parsed.manifest.anonymized);
    assert!(parsed
        .inventory
        .claude_md
        .as_deref()
        .unwrap()
        .contains("<person>"));
    assert!(parsed.inventory.routines[0].prompt.contains("<person>"));
    assert!(parsed.inventory.learnings[0].text.contains("<payment-processor>"));
}

#[test]
fn missing_agent_dir_yields_empty_inventory() {
    let dir = TempDir::new().unwrap();
    // Don't seed anything — dir is just empty.
    let inv = gather_inventory(dir.path()).unwrap();
    assert!(inv.claude_md.is_none());
    assert!(inv.skills.is_empty());
    assert!(inv.routines.is_empty());
    assert!(inv.learnings.is_empty());
}

#[test]
fn malformed_routines_json_returns_error() {
    let dir = TempDir::new().unwrap();
    fs::create_dir_all(dir.path().join(".houston/routines")).unwrap();
    fs::write(
        dir.path().join(".houston/routines/routines.json"),
        "{ not valid json",
    )
    .unwrap();
    let err = gather_inventory(dir.path()).unwrap_err();
    let msg = err.to_string();
    assert!(msg.contains("routines.json"));
}
