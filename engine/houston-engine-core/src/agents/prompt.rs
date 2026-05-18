//! Agent directory helpers used to assemble the system prompt and seed
//! template files.
//!
//! Relocated from `app/houston-tauri/src/agent.rs` and
//! `app/src-tauri/src/agent.rs` as part of the engine standalone migration.
//! Transport-neutral — the Tauri adapter, REST routes, and tests all consume
//! the same functions.

use serde::Serialize;
use std::fs;
use std::path::Path;

/// Seed a single file into a directory if it doesn't already exist.
/// Never overwrites user edits.
pub fn seed_file(dir: &Path, name: &str, content: &str) -> Result<(), String> {
    let path = dir.join(name);
    if !path.exists() {
        fs::write(&path, content).map_err(|e| format!("Failed to write {name}: {e}"))?;
    }
    Ok(())
}

/// Build a system prompt by reading agent files and assembling them.
///
/// - `base_prompt`: The base identity prompt (always included first).
/// - `bootstrap_name`: If this file exists, it's injected prominently as a
///   first-run signal.
/// - `files`: List of `(filename, section_label)` to read and inject.
pub fn build_system_prompt(
    dir: &Path,
    base_prompt: &str,
    bootstrap_name: Option<&str>,
    files: &[(&str, &str)],
) -> String {
    let mut sections = vec![base_prompt.to_string()];

    if let Some(name) = bootstrap_name {
        if let Ok(content) = fs::read_to_string(dir.join(name)) {
            sections.push(format!(
                "# FIRST RUN — BOOTSTRAP\n\
                 {name} exists. This is your first time. Follow it EXACTLY.\n\n\
                 {content}"
            ));
        }
    }

    for (name, label) in files {
        if let Ok(content) = fs::read_to_string(dir.join(name)) {
            sections.push(format!("# {label}\n\n{content}"));
        }
    }

    sections.join("\n\n---\n\n")
}

/// Info about an agent file for UI display.
#[derive(Serialize)]
pub struct AgentFileInfo {
    pub name: String,
    pub description: String,
    pub exists: bool,
}

/// List known agent files with their existence status.
pub fn list_files(dir: &Path, known: &[(&str, &str)]) -> Vec<AgentFileInfo> {
    known
        .iter()
        .map(|(name, desc)| AgentFileInfo {
            name: name.to_string(),
            description: desc.to_string(),
            exists: dir.join(name).exists(),
        })
        .collect()
}

/// Read an agent file, only allowing known file names.
pub fn read_file(dir: &Path, name: &str, allowed: &[&str]) -> Result<String, String> {
    if !allowed.contains(&name) {
        return Err(format!("Unknown agent file: {name}"));
    }
    fs::read_to_string(dir.join(name)).map_err(|e| format!("Failed to read {name}: {e}"))
}

// ---------------------------------------------------------------------------
// Houston-flavored seed + system prompt (used by sessions::start*).
// ---------------------------------------------------------------------------

/// Default CLAUDE.md content for a brand-new agent.
pub const DEFAULT_CLAUDE_MD: &str = r#"# Houston Agent

## Role
You are a helpful AI assistant.

## Rules
- Be concise and direct
- Ask before making destructive changes
- Explain your reasoning when making decisions
"#;

/// Seed the Houston agent skeleton into an agent directory.
///
/// Creates `CLAUDE.md` (user-editable job description) and the
/// `.houston/prompts/modes/` directory for per-mode overrides. Does **not**
/// seed any product-layer prompt files — those live in the app process and
/// arrive via the engine's config (e.g. `HOUSTON_APP_SYSTEM_PROMPT`).
pub fn seed_agent(dir: &Path) -> Result<(), String> {
    seed_file(dir, "CLAUDE.md", DEFAULT_CLAUDE_MD)?;

    // Codex (`codex`) reads `AGENTS.md` from project memory; Gemini-cli
    // reads `GEMINI.md`. Houston has one canonical agent role file —
    // `CLAUDE.md` — and exposes it to the other CLIs via symlink so all
    // three providers see the same per-agent instructions without us
    // having to duplicate file content (drift-free).
    let agents_md = dir.join("AGENTS.md");
    if !agents_md.exists() {
        #[cfg(unix)]
        {
            let _ = std::os::unix::fs::symlink("CLAUDE.md", &agents_md);
        }
        #[cfg(windows)]
        {
            let _ = std::os::windows::fs::symlink_file("CLAUDE.md", &agents_md);
        }
    }

    let gemini_md = dir.join("GEMINI.md");
    if !gemini_md.exists() {
        #[cfg(unix)]
        {
            let _ = std::os::unix::fs::symlink("CLAUDE.md", &gemini_md);
        }
        #[cfg(windows)]
        {
            let _ = std::os::windows::fs::symlink_file("CLAUDE.md", &gemini_md);
        }
    }

    let prompts_dir = dir.join(".houston/prompts");
    let modes_dir = prompts_dir.join("modes");
    fs::create_dir_all(&modes_dir)
        .map_err(|e| format!("Failed to create .houston/prompts/modes: {e}"))?;

    if let Err(e) = houston_agent_files::migrate_agent_data(dir) {
        tracing::warn!("[agent] migration failed for {}: {e}", dir.display());
    }

    Ok(())
}

/// Build the per-agent context block the engine assembles from disk.
///
/// Transport-neutral and product-neutral: it is everything the engine knows
/// about the agent's filesystem layout (working dir, CLAUDE.md, mode file,
/// skills index, integrations list) and nothing about the Houston product
/// voice. Callers (typically the Houston app) prepend their own product
/// prompt before handing the result to the CLI subprocess.
pub fn build_agent_context(
    dir: &Path,
    working_dir_override: Option<&Path>,
    mode: Option<&str>,
) -> String {
    let mut parts: Vec<String> = Vec::new();
    let prompts_dir = dir.join(".houston/prompts");

    let effective_dir = working_dir_override.unwrap_or(dir);
    let working_dir = effective_dir.to_string_lossy();
    parts.push(format!(
        "# Working Directory — MANDATORY\n\n\
         Your working directory is: `{working_dir}`\n\n\
         **CRITICAL RULES:**\n\
         - ALL files you create, read, or modify MUST be within this directory.\n\
         - NEVER create files outside this directory (not in ~/, ~/.agents/, ~/Development/, /tmp/, or anywhere else).\n\
         - Skills go in `.agents/skills/` (relative to this directory).\n\
         - Houston data goes in `.houston/` (relative to this directory).\n\
         - If you need a new file or folder, create it HERE.\n\
         - When referencing paths, always use paths relative to or inside `{working_dir}`."
    ));

    if let Some(m) = mode {
        let mode_path = prompts_dir.join(format!("modes/{m}.md"));
        let fallback_path = prompts_dir.join(format!("{m}.md"));
        if let Ok(content) =
            fs::read_to_string(&mode_path).or_else(|_| fs::read_to_string(&fallback_path))
        {
            parts.push(content);
        } else {
            tracing::warn!("[agent] mode file not found: {m}.md");
        }
    }

    if let Some(learnings) = super::learnings_context::build_learnings_context(dir) {
        parts.push(learnings);
    }

    let skills_dir = dir.join(".agents/skills");
    if let Ok(index) = houston_skills::build_skills_index(&skills_dir) {
        if !index.is_empty() {
            parts.push(index);
        }
    }

    let integrations_path = dir.join(".houston/integrations.json");
    if let Ok(content) = fs::read_to_string(&integrations_path) {
        let names: Vec<String> =
            serde_json::from_str::<Vec<serde_json::Value>>(&content)
                .ok()
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| {
                            v.get("toolkit").and_then(|t| t.as_str()).map(String::from)
                        })
                        .collect()
                })
                .or_else(|| {
                    serde_json::from_str::<serde_json::Map<String, serde_json::Value>>(&content)
                        .ok()
                        .map(|map| map.keys().cloned().collect())
                })
                .unwrap_or_default();

        if !names.is_empty() {
            parts.push(format!(
                "# Integrations — Previously Used\n\n\
                 You have used these Composio integrations in past sessions: {}.\n\
                 Prefer these when the task involves their services.",
                names.join(", ")
            ));
        }
    }

    parts.join("\n\n---\n\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn seed_file_is_write_once() {
        let d = TempDir::new().unwrap();
        seed_file(d.path(), "CLAUDE.md", "first").unwrap();
        seed_file(d.path(), "CLAUDE.md", "second").unwrap();
        assert_eq!(fs::read_to_string(d.path().join("CLAUDE.md")).unwrap(), "first");
    }

    #[cfg(unix)]
    #[test]
    fn seed_agent_exposes_claude_md_to_other_clis() {
        let d = TempDir::new().unwrap();
        seed_agent(d.path()).unwrap();

        // Codex reads AGENTS.md, Gemini reads GEMINI.md — both must
        // resolve to the canonical CLAUDE.md so all three CLIs see the
        // same per-agent role description.
        let agents_md = d.path().join("AGENTS.md");
        assert_eq!(fs::read_link(agents_md).unwrap(), Path::new("CLAUDE.md"));

        let gemini_md = d.path().join("GEMINI.md");
        assert_eq!(fs::read_link(gemini_md).unwrap(), Path::new("CLAUDE.md"));
    }

    #[test]
    fn build_system_prompt_assembles_known_sections() {
        let d = TempDir::new().unwrap();
        fs::write(d.path().join("BOOT.md"), "boot body").unwrap();
        fs::write(d.path().join("section.md"), "section body").unwrap();

        let out = build_system_prompt(
            d.path(),
            "BASE",
            Some("BOOT.md"),
            &[("section.md", "Section")],
        );
        assert!(out.contains("BASE"));
        assert!(out.contains("FIRST RUN — BOOTSTRAP"));
        assert!(out.contains("boot body"));
        assert!(out.contains("# Section"));
        assert!(out.contains("section body"));
    }

    #[test]
    fn build_agent_context_includes_learnings_snapshot() {
        let d = TempDir::new().unwrap();
        let learnings_dir = d.path().join(".houston/learnings");
        fs::create_dir_all(&learnings_dir).unwrap();
        fs::write(
            learnings_dir.join("learnings.json"),
            r#"[
                { "id": "one", "text": "User calls this contact Mr. Perkins.", "created_at": "2026-01-01T00:00:00Z" }
            ]"#,
        )
        .unwrap();

        let out = build_agent_context(d.path(), None, None);

        assert!(out.contains("# Persistent Learnings - Frozen Snapshot"));
        assert!(out.contains("User calls this contact Mr. Perkins."));
        assert!(!out.contains("2026-01-01"));
    }

    #[test]
    fn list_files_reports_existence() {
        let d = TempDir::new().unwrap();
        fs::write(d.path().join("present.md"), "x").unwrap();
        let out = list_files(
            d.path(),
            &[("present.md", "exists"), ("absent.md", "missing")],
        );
        assert_eq!(out.len(), 2);
        assert!(out[0].exists);
        assert!(!out[1].exists);
    }

    #[test]
    fn read_file_rejects_unknown_name() {
        let d = TempDir::new().unwrap();
        let err = read_file(d.path(), "../etc/passwd", &["allowed.md"]).unwrap_err();
        assert!(err.contains("Unknown agent file"));
    }
}
