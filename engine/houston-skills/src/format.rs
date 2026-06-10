//! SKILL.md frontmatter parsing and serialization.
//!
//! Frontmatter is a YAML block delimited by `---` lines. Example:
//!
//! ```text
//! ---
//! name: research-company
//! description: Deep-dive on a company's positioning and pricing
//! version: 3
//! tags: [research, marketing]
//! created: 2026-03-28
//! last_used: 2026-04-04
//! category: research
//! featured: yes
//! integrations: [tavily, gmail]
//! image: magnifying-glass-tilted-left
//! ---
//! ```
//!
//! Parsing is delegated to `serde_yml`. Serialization is hand-rolled so
//! the output ordering and formatting stays deterministic and
//! round-trippable. Legacy `inputs` and `prompt_template` still parse,
//! but new Store-packaged skills should not declare them.

use crate::{SkillError, SkillInput, SkillInputKind, SkillSummary};
use serde::Deserialize;
use std::path::Path;

/// Parse a SKILL.md file into a SkillSummary + body content.
pub fn parse_file(path: &Path) -> Result<(SkillSummary, String), SkillError> {
    let raw = std::fs::read_to_string(path).map_err(|e| SkillError::Io(e.to_string()))?;
    parse_content(&raw)
}

/// Parse SKILL.md content string into SkillSummary + body.
pub fn parse_content(content: &str) -> Result<(SkillSummary, String), SkillError> {
    let (frontmatter, body) = split_frontmatter(content)?;
    let summary = parse_frontmatter(&frontmatter)?;
    Ok((summary, body))
}

/// Split content into frontmatter string and body string.
fn split_frontmatter(content: &str) -> Result<(String, String), SkillError> {
    let trimmed = content.trim_start();
    if !trimmed.starts_with("---") {
        return Err(SkillError::Parse("Missing opening --- delimiter".into()));
    }
    let after_first = &trimmed[3..];
    let after_first = after_first.strip_prefix('\n').unwrap_or(after_first);

    let Some(end_idx) = after_first.find("\n---") else {
        return Err(SkillError::Parse("Missing closing --- delimiter".into()));
    };
    let frontmatter = after_first[..end_idx].to_string();
    let body_start = end_idx + 4; // "\n---"
    let body = if body_start < after_first.len() {
        after_first[body_start..].trim_start_matches('\n').to_string()
    } else {
        String::new()
    };
    Ok((frontmatter, body))
}

/// Intermediate type that maps directly to the YAML frontmatter shape.
/// `featured` and a few other fields are deserialized loosely so authors
/// can write `featured: yes` (string) or `featured: true` (bool).
#[derive(Debug, Deserialize)]
struct Frontmatter {
    name: String,
    #[serde(default)]
    description: Option<String>,
    #[serde(default = "default_version")]
    version: u32,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    created: Option<String>,
    #[serde(default)]
    last_used: Option<String>,
    #[serde(default)]
    category: Option<String>,
    #[serde(default, deserialize_with = "deserialize_loose_bool")]
    featured: bool,
    #[serde(default)]
    integrations: Vec<String>,
    #[serde(default)]
    image: Option<String>,
    #[serde(default)]
    inputs: Vec<SkillInput>,
    #[serde(default)]
    prompt_template: Option<String>,
}

fn default_version() -> u32 {
    1
}

/// Accept the YAML-ish truthy values authors typically write
/// (`yes`, `true`, `1`, `on`) alongside real booleans and integers.
fn deserialize_loose_bool<'de, D>(d: D) -> Result<bool, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let v = serde_yml::Value::deserialize(d)?;
    Ok(coerce_bool(&v))
}

fn coerce_bool(v: &serde_yml::Value) -> bool {
    match v {
        serde_yml::Value::Bool(b) => *b,
        serde_yml::Value::String(s) => matches!(
            s.trim().to_ascii_lowercase().as_str(),
            "yes" | "true" | "1" | "on" | "y"
        ),
        serde_yml::Value::Number(n) => n.as_i64().map(|i| i != 0).unwrap_or(false),
        _ => false,
    }
}

fn parse_frontmatter(text: &str) -> Result<SkillSummary, SkillError> {
    let fm: Frontmatter = serde_yml::from_str(text).map_err(|e| {
        SkillError::Parse(format!("Frontmatter YAML invalid: {e}"))
    })?;
    if fm.name.trim().is_empty() {
        return Err(SkillError::Parse("Missing 'name' in frontmatter".into()));
    }

    Ok(SkillSummary {
        name: fm.name,
        description: fm.description.unwrap_or_default(),
        version: fm.version,
        tags: fm.tags,
        created: fm.created,
        last_used: fm.last_used,
        category: fm.category.and_then(non_empty),
        featured: fm.featured,
        integrations: fm.integrations,
        image: fm.image.and_then(non_empty),
        inputs: fm.inputs,
        prompt_template: fm.prompt_template.and_then(non_empty),
    })
}

fn non_empty(s: String) -> Option<String> {
    let t = s.trim();
    if t.is_empty() {
        None
    } else {
        Some(s)
    }
}

// ── Scalar emission ────────────────────────────────────────────────
//
// Frontmatter values are emitted as YAML scalars. A plain (unquoted) scalar is
// only safe for a restricted set of strings; anything else MUST be quoted or
// the document fails to parse back — which silently drops the skill from
// `list_skills`. The canonical break is a description containing `": "` (a YAML
// mapping indicator), e.g. the Vercel `ai-sdk` skill.

/// Whether `s` must be double-quoted to survive a YAML block-scalar round-trip.
fn needs_quote(s: &str) -> bool {
    if s.is_empty() || s != s.trim() {
        return true;
    }
    // `": "` and a trailing `:` read as a mapping; ` #` starts a comment.
    if s.contains(": ") || s.ends_with(':') || s.contains(" #") {
        return true;
    }
    if s.contains(|c| matches!(c, '\n' | '\t' | '\r' | '"' | '\'' | '#')) {
        return true;
    }
    // A leading indicator character changes how the scalar is read.
    let first = s.chars().next().unwrap();
    if "!&*?{}[]|>@`\"'%#,:- ".contains(first) {
        return true;
    }
    is_reserved_scalar(s)
}

/// Bare tokens YAML would resolve to a bool / null / number instead of a string.
fn is_reserved_scalar(s: &str) -> bool {
    matches!(
        s.to_ascii_lowercase().as_str(),
        "true" | "false" | "yes" | "no" | "on" | "off" | "null" | "nan" | "~"
    ) || s.chars().all(|c| c.is_ascii_digit())
}

fn double_quote(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        match c {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\n' => out.push_str("\\n"),
            '\t' => out.push_str("\\t"),
            '\r' => out.push_str("\\r"),
            _ => out.push(c),
        }
    }
    out.push('"');
    out
}

/// A YAML scalar safe in block context (e.g. `description: <here>`).
fn yaml_block(s: &str) -> String {
    if needs_quote(s) {
        double_quote(s)
    } else {
        s.to_string()
    }
}

/// A YAML scalar safe inside a flow sequence (e.g. `tags: [<here>, ...]`),
/// where `,` `[` `]` `{` `}` are additionally significant.
fn yaml_flow(s: &str) -> String {
    if needs_quote(s) || s.contains(|c| matches!(c, ',' | '[' | ']' | '{' | '}')) {
        double_quote(s)
    } else {
        s.to_string()
    }
}

/// Serialize a SkillSummary + body into SKILL.md content. Field ordering
/// is fixed for stable diffs; absent optional fields are skipped entirely.
pub fn serialize(summary: &SkillSummary, body: &str) -> String {
    let mut out = String::with_capacity(384 + body.len());
    out.push_str("---\n");
    out.push_str(&format!("name: {}\n", yaml_block(&summary.name)));
    out.push_str(&format!(
        "description: {}\n",
        yaml_block(&summary.description)
    ));
    out.push_str(&format!("version: {}\n", summary.version));
    if !summary.tags.is_empty() {
        let tags_str = summary
            .tags
            .iter()
            .map(|t| yaml_flow(t))
            .collect::<Vec<_>>()
            .join(", ");
        out.push_str(&format!("tags: [{tags_str}]\n"));
    } else {
        out.push_str("tags: []\n");
    }
    if let Some(created) = &summary.created {
        out.push_str(&format!("created: {created}\n"));
    }
    if let Some(last_used) = &summary.last_used {
        out.push_str(&format!("last_used: {last_used}\n"));
    }
    if let Some(category) = &summary.category {
        out.push_str(&format!("category: {}\n", yaml_block(category)));
    }
    if summary.featured {
        out.push_str("featured: yes\n");
    }
    if !summary.integrations.is_empty() {
        let list = summary
            .integrations
            .iter()
            .map(|i| yaml_flow(i))
            .collect::<Vec<_>>()
            .join(", ");
        out.push_str(&format!("integrations: [{list}]\n"));
    }
    if let Some(image) = &summary.image {
        out.push_str(&format!("image: {}\n", yaml_block(image)));
    }
    if !summary.inputs.is_empty() {
        out.push_str("inputs:\n");
        for input in &summary.inputs {
            out.push_str(&format!("  - name: {}\n", yaml_block(&input.name)));
            out.push_str(&format!("    label: {}\n", yaml_block(&input.label)));
            if let Some(ph) = &input.placeholder {
                out.push_str(&format!("    placeholder: {}\n", yaml_block(ph)));
            }
            if input.kind != SkillInputKind::default() {
                out.push_str(&format!("    type: {}\n", input_kind_str(input.kind)));
            }
            if !input.required {
                out.push_str("    required: false\n");
            }
            if let Some(d) = &input.default {
                out.push_str(&format!("    default: {}\n", yaml_block(d)));
            }
            if !input.options.is_empty() {
                let list = input
                    .options
                    .iter()
                    .map(|o| yaml_flow(o))
                    .collect::<Vec<_>>()
                    .join(", ");
                out.push_str(&format!("    options: [{list}]\n"));
            }
        }
    }
    if let Some(template) = &summary.prompt_template {
        if template.contains('\n') {
            // YAML pipe-block for multi-line. Indent every line by two spaces.
            out.push_str("prompt_template: |\n");
            for line in template.lines() {
                out.push_str("  ");
                out.push_str(line);
                out.push('\n');
            }
        } else {
            out.push_str(&format!("prompt_template: {}\n", yaml_block(template)));
        }
    }
    out.push_str("---\n");
    if !body.is_empty() {
        out.push('\n');
        out.push_str(body);
        if !body.ends_with('\n') {
            out.push('\n');
        }
    }
    out
}

fn input_kind_str(kind: SkillInputKind) -> &'static str {
    match kind {
        SkillInputKind::Text => "text",
        SkillInputKind::Textarea => "textarea",
        SkillInputKind::Select => "select",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> SkillSummary {
        SkillSummary {
            name: "test".into(),
            description: "A test skill".into(),
            version: 1,
            tags: vec![],
            created: None,
            last_used: None,
            category: None,
            featured: false,
            integrations: vec![],
            image: None,
            inputs: vec![],
            prompt_template: None,
        }
    }

    #[test]
    fn parse_basic_frontmatter() {
        let content = "---\nname: test-skill\ndescription: A test\nversion: 2\ntags: [a, b]\ncreated: 2026-01-01\nlast_used: 2026-04-04\n---\n\n## Procedure\nDo stuff\n";
        let (summary, body) = parse_content(content).unwrap();
        assert_eq!(summary.name, "test-skill");
        assert_eq!(summary.description, "A test");
        assert_eq!(summary.version, 2);
        assert_eq!(summary.tags, vec!["a", "b"]);
        assert_eq!(summary.created.as_deref(), Some("2026-01-01"));
        assert_eq!(summary.last_used.as_deref(), Some("2026-04-04"));
        assert!(body.contains("## Procedure"));
    }

    #[test]
    fn parse_missing_optional_fields() {
        let content = "---\nname: minimal\n---\n\nBody here\n";
        let (summary, body) = parse_content(content).unwrap();
        assert_eq!(summary.name, "minimal");
        assert_eq!(summary.description, "");
        assert_eq!(summary.version, 1);
        assert!(summary.tags.is_empty());
        assert!(summary.created.is_none());
        assert_eq!(body.trim(), "Body here");
    }

    #[test]
    fn parse_malformed_no_opening() {
        let result = parse_content("no frontmatter here");
        assert!(result.is_err());
    }

    #[test]
    fn parse_malformed_no_closing() {
        let result = parse_content("---\nname: test\nno closing");
        assert!(result.is_err());
    }

    #[test]
    fn roundtrip_basic() {
        let mut s = fixture();
        s.tags = vec!["devops".into(), "docker".into()];
        s.created = Some("2026-01-01".into());
        s.last_used = Some("2026-04-04".into());
        s.version = 3;
        let body = "## Procedure\n\n1. Do stuff\n";
        let serialized = serialize(&s, body);
        let (parsed, parsed_body) = parse_content(&serialized).unwrap();
        assert_eq!(parsed.tags, vec!["devops", "docker"]);
        assert_eq!(parsed.version, 3);
        assert_eq!(parsed_body.trim(), body.trim());
    }

    #[test]
    fn serialize_round_trips_description_with_colon() {
        // The real-world break: the Vercel `ai-sdk` skill's description contains
        // ": " (a YAML mapping indicator) and inner quotes. Emitted unquoted it
        // produces invalid YAML, so the skill silently vanishes from the list.
        let desc = "Answer questions. Use when developers: (1) call generateText, (2) build agents. Triggers: \"AI SDK\", \"useChat\".";
        let s = SkillSummary {
            description: desc.into(),
            ..fixture()
        };
        let serialized = serialize(&s, "body");
        let (parsed, _) =
            parse_content(&serialized).expect("a colon-laden description must round-trip");
        assert_eq!(parsed.description, desc);
    }

    #[test]
    fn serialize_round_trips_special_scalars() {
        let cases = [
            "leading words then: a colon space",
            "'single quoted in source'",
            "has # hash and : colon",
            "ends with a colon:",
            "true",                  // reserved-looking
            "#starts with hash",
            "café, açaí — non-ascii", // non-ascii + comma + em dash
        ];
        for desc in cases {
            let s = SkillSummary {
                description: (*desc).into(),
                category: Some((*desc).into()),
                image: Some((*desc).into()),
                ..fixture()
            };
            let serialized = serialize(&s, "b");
            let (parsed, _) = parse_content(&serialized)
                .unwrap_or_else(|e| panic!("must round-trip {desc:?}: {e}"));
            assert_eq!(parsed.description, desc, "description {desc:?}");
            assert_eq!(parsed.category.as_deref(), Some(desc), "category {desc:?}");
            assert_eq!(parsed.image.as_deref(), Some(desc), "image {desc:?}");
        }
    }

    #[test]
    fn serialize_quotes_flow_items_with_separators() {
        let s = SkillSummary {
            tags: vec!["a,b".into(), "normal".into()],
            integrations: vec!["x[y]".into()],
            ..fixture()
        };
        let serialized = serialize(&s, "b");
        let (parsed, _) = parse_content(&serialized).expect("flow items must round-trip");
        assert_eq!(parsed.tags, vec!["a,b", "normal"]);
        assert_eq!(parsed.integrations, vec!["x[y]"]);
    }

    #[test]
    fn empty_tags_roundtrip() {
        let s = SkillSummary {
            name: "no-tags".into(),
            description: "No tags".into(),
            ..fixture()
        };
        let serialized = serialize(&s, "body");
        assert!(serialized.contains("tags: []"));
        let (parsed, _) = parse_content(&serialized).unwrap();
        assert!(parsed.tags.is_empty());
    }

    #[test]
    fn parse_category_and_featured() {
        let content = "---\nname: invoice-chaser\ndescription: Nudge late invoices\ncategory: Email\nfeatured: yes\n---\n";
        let (summary, _) = parse_content(content).unwrap();
        assert_eq!(summary.category.as_deref(), Some("Email"));
        assert!(summary.featured);
    }

    #[test]
    fn parse_featured_accepts_variants() {
        for truthy in ["yes", "YES", "true", "1", "on"] {
            let content = format!(
                "---\nname: s\ndescription: d\nfeatured: {truthy}\n---\n"
            );
            let (summary, _) = parse_content(&content).unwrap();
            assert!(summary.featured, "expected truthy for {truthy}");
        }
        for falsy in ["no", "false", "0", "maybe"] {
            let content = format!(
                "---\nname: s\ndescription: d\nfeatured: {falsy}\n---\n"
            );
            let (summary, _) = parse_content(&content).unwrap();
            assert!(!summary.featured, "expected falsy for {falsy}");
        }
    }

    #[test]
    fn parse_image_url_roundtrip() {
        let url = "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=400";
        let content = format!(
            "---\nname: s\ndescription: d\nimage: {url}\n---\n"
        );
        let (summary, _) = parse_content(&content).unwrap();
        assert_eq!(summary.image.as_deref(), Some(url));

        let serialized = serialize(&summary, "body");
        assert!(serialized.contains(&format!("image: {url}")));
    }

    #[test]
    fn parse_integrations_list() {
        let content = "---\nname: s\ndescription: d\nintegrations: [gmail, slack, googlecalendar]\n---\n";
        let (summary, _) = parse_content(content).unwrap();
        assert_eq!(
            summary.integrations,
            vec!["gmail", "slack", "googlecalendar"]
        );
    }

    #[test]
    fn parse_inputs_full() {
        let content = r#"---
name: research
description: Research a company
inputs:
  - name: company_url
    label: Company to research
    placeholder: "e.g. https://stripe.com"
  - name: focus
    label: What to focus on
    type: textarea
    required: false
    default: "Pricing, news"
prompt_template: |
  Research the company at {{company_url}}.
  Focus areas: {{focus}}
---
"#;
        let (summary, _) = parse_content(content).unwrap();
        assert_eq!(summary.inputs.len(), 2);
        let first = &summary.inputs[0];
        assert_eq!(first.name, "company_url");
        assert_eq!(first.label, "Company to research");
        assert_eq!(
            first.placeholder.as_deref(),
            Some("e.g. https://stripe.com")
        );
        assert_eq!(first.kind, SkillInputKind::Text);
        assert!(first.required);
        let second = &summary.inputs[1];
        assert_eq!(second.kind, SkillInputKind::Textarea);
        assert!(!second.required);
        assert_eq!(second.default.as_deref(), Some("Pricing, news"));
        let template = summary.prompt_template.as_deref().unwrap();
        assert!(template.contains("{{company_url}}"));
        assert!(template.contains("{{focus}}"));
    }

    #[test]
    fn roundtrip_inputs_and_template() {
        let s = SkillSummary {
            name: "research".into(),
            description: "d".into(),
            inputs: vec![
                SkillInput {
                    name: "company_url".into(),
                    label: "Company URL".into(),
                    placeholder: Some("https://example.com".into()),
                    kind: SkillInputKind::Text,
                    required: true,
                    default: None,
                    options: vec![],
                },
                SkillInput {
                    name: "focus".into(),
                    label: "Focus".into(),
                    placeholder: None,
                    kind: SkillInputKind::Textarea,
                    required: false,
                    default: Some("Pricing".into()),
                    options: vec![],
                },
            ],
            prompt_template: Some(
                "Research {{company_url}}.\nFocus: {{focus}}".into(),
            ),
            ..fixture()
        };
        let serialized = serialize(&s, "body");
        // Multi-line template should use the pipe-block.
        assert!(serialized.contains("prompt_template: |"));
        let (parsed, _) = parse_content(&serialized).unwrap();
        assert_eq!(parsed.inputs, s.inputs);
        assert_eq!(parsed.prompt_template, s.prompt_template);
    }

    #[test]
    fn serialize_skips_empty_optional_fields() {
        let serialized = serialize(&fixture(), "body");
        assert!(!serialized.contains("integrations:"));
        assert!(!serialized.contains("image:"));
        assert!(!serialized.contains("inputs:"));
        assert!(!serialized.contains("prompt_template:"));
        assert!(!serialized.contains("category:"));
        assert!(!serialized.contains("featured:"));
    }

    #[test]
    fn parse_select_input_with_options() {
        let content = r#"---
name: invite
description: Invite someone
inputs:
  - name: provider
    label: Email provider
    type: select
    options: [gmail, outlook]
    default: gmail
prompt_template: |
  Invite via {{provider}}.
---
"#;
        let (summary, _) = parse_content(content).unwrap();
        assert_eq!(summary.inputs.len(), 1);
        let i = &summary.inputs[0];
        assert_eq!(i.kind, SkillInputKind::Select);
        assert_eq!(i.options, vec!["gmail", "outlook"]);
        assert_eq!(i.default.as_deref(), Some("gmail"));

        // Roundtrip
        let s = serialize(&summary, "body");
        assert!(s.contains("type: select"));
        assert!(s.contains("options: [gmail, outlook]"));
        let (parsed, _) = parse_content(&s).unwrap();
        assert_eq!(parsed.inputs, summary.inputs);
    }

    #[test]
    fn parse_unknown_fields_are_ignored() {
        // Older skills may still carry an `icon:` line. The parser must
        // ignore it gracefully so installs don't break after the field
        // was removed from the schema.
        let content =
            "---\nname: s\ndescription: d\nicon: shopping-cart\n---\n";
        let (summary, _) = parse_content(content).unwrap();
        assert_eq!(summary.name, "s");
    }

    #[test]
    fn parse_legacy_starter_prompt_is_ignored() {
        // Older files used `starter_prompt`; it should still parse cleanly.
        let content =
            "---\nname: s\ndescription: d\nstarter_prompt: Hi there\n---\n";
        let (summary, _) = parse_content(content).unwrap();
        assert!(summary.prompt_template.is_none());
        assert!(summary.inputs.is_empty());
    }
}
