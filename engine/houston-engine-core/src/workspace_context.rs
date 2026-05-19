//! Workspace-level context files.
//!
//! Two markdown files live at the root of every workspace directory:
//!
//! - `WORKSPACE.md` — facts about the company / project / shared environment.
//!   Same for every agent in this workspace.
//! - `USER.md` — facts about the human running this workspace (role, goals,
//!   preferences). Per-workspace today; will become per-account once Houston
//!   ships multi-user workspaces.
//!
//! Both files start empty (the Settings UI shows its empty state until the
//! user writes something) and get appended to every agent's system prompt at
//! session start. They are user-editable (Settings UI) and agent-editable
//! (the agent can update them via the normal file-write tool when the user
//! shares new info). Changes take effect on the **next** chat — running
//! sessions keep the copy that was baked into their prompt at spawn.

use crate::error::{CoreError, CoreResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

pub const WORKSPACE_MD: &str = "WORKSPACE.md";
pub const USER_MD: &str = "USER.md";

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceContext {
    pub workspace: String,
    pub user: String,
}

fn workspace_path(ws_dir: &Path) -> PathBuf {
    ws_dir.join(WORKSPACE_MD)
}

fn user_path(ws_dir: &Path) -> PathBuf {
    ws_dir.join(USER_MD)
}

fn read_or_empty(path: &Path) -> String {
    fs::read_to_string(path).unwrap_or_default()
}

/// Read both files. Missing files report as empty strings.
pub fn read(ws_dir: &Path) -> CoreResult<WorkspaceContext> {
    Ok(WorkspaceContext {
        workspace: read_or_empty(&workspace_path(ws_dir)),
        user: read_or_empty(&user_path(ws_dir)),
    })
}

/// Overwrite both files with the supplied content.
pub fn write(ws_dir: &Path, ctx: &WorkspaceContext) -> CoreResult<()> {
    fs::create_dir_all(ws_dir)?;
    fs::write(workspace_path(ws_dir), &ctx.workspace)?;
    fs::write(user_path(ws_dir), &ctx.user)?;
    Ok(())
}

/// Resolve a workspace directory by id under the given root.
pub fn resolve_dir(root: &Path, id: &str) -> CoreResult<PathBuf> {
    let workspaces = crate::workspaces::read_all(root)?;
    let ws = workspaces
        .iter()
        .find(|w| w.id == id)
        .ok_or_else(|| CoreError::NotFound(format!("workspace {id}")))?;
    Ok(root.join(&ws.name))
}

/// Build the prompt section the engine appends to every agent's system prompt.
///
/// Always present for any agent whose parent dir is a real workspace (has a
/// `.houston/` subfolder), even when both files are empty: the section tells
/// the agent the slots exist, what they're for, and that it's authorized to
/// write them when the user shares new info.
///
/// Returns `None` only when `ws_dir` does not look like a real workspace, so
/// test agent dirs and ad-hoc working dirs are not polluted with stub paths.
pub fn build_prompt_section(ws_dir: &Path) -> Option<String> {
    if !ws_dir.join(".houston").exists() {
        return None;
    }
    let workspace_md_path = workspace_path(ws_dir);
    let user_md_path = user_path(ws_dir);

    let workspace = read_or_empty(&workspace_md_path);
    let user = read_or_empty(&user_md_path);

    let workspace_body = if workspace.trim().is_empty() {
        "(empty so far. When the user shares anything about the company, \
         product, customers, or workspace conventions, write it to the file \
         path below.)"
            .to_string()
    } else {
        workspace.trim_end().to_string()
    };
    let user_body = if user.trim().is_empty() {
        "(empty so far. When the user tells you about their role, goals, or \
         how they like to work, write it to the file path below.)"
            .to_string()
    } else {
        user.trim_end().to_string()
    };

    let mut out = String::new();
    out.push_str("# Workspace Context\n\n");
    out.push_str(&workspace_body);
    out.push_str("\n\n# User Context\n\n");
    out.push_str(&user_body);
    out.push_str(&format!(
        "\n\nThe two sections above are loaded from these files at the root \
         of the workspace:\n\
         - `{}` — facts about the workspace, shared by every agent here.\n\
         - `{}` — facts about the user running this workspace.\n\n\
         When the user tells you something new about themselves or about the \
         workspace, update the matching file using its absolute path above so \
         future chats remember it. These two files are an explicit exception \
         to your working-directory rule, you are allowed to read and write \
         them. Edits take effect on the next chat, the current chat keeps the \
         copy that was loaded at startup.",
        workspace_md_path.display(),
        user_md_path.display(),
    ));
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn read_returns_empty_when_files_absent() {
        let d = TempDir::new().unwrap();
        let ctx = read(d.path()).unwrap();
        assert_eq!(ctx.workspace, "");
        assert_eq!(ctx.user, "");
    }

    #[test]
    fn write_round_trips() {
        let d = TempDir::new().unwrap();
        write(
            d.path(),
            &WorkspaceContext {
                workspace: "Acme Corp, B2B fintech.".into(),
                user: "Juan, sales lead.".into(),
            },
        )
        .unwrap();
        let ctx = read(d.path()).unwrap();
        assert_eq!(ctx.workspace, "Acme Corp, B2B fintech.");
        assert_eq!(ctx.user, "Juan, sales lead.");
    }

    #[test]
    fn build_prompt_section_includes_filled_content() {
        let d = TempDir::new().unwrap();
        fs::create_dir_all(d.path().join(".houston")).unwrap();
        fs::write(d.path().join(WORKSPACE_MD), "Acme Corp.").unwrap();
        fs::write(d.path().join(USER_MD), "Juan, sales.").unwrap();
        let out = build_prompt_section(d.path()).unwrap();
        assert!(out.contains("# Workspace Context"));
        assert!(out.contains("Acme Corp."));
        assert!(out.contains("# User Context"));
        assert!(out.contains("Juan, sales."));
        assert!(out.contains("WORKSPACE.md"));
        assert!(out.contains("USER.md"));
    }

    #[test]
    fn build_prompt_section_uses_empty_markers_when_files_missing() {
        let d = TempDir::new().unwrap();
        fs::create_dir_all(d.path().join(".houston")).unwrap();
        let out = build_prompt_section(d.path()).unwrap();
        assert!(out.contains("# Workspace Context"));
        assert!(out.contains("(empty so far"));
        assert!(out.contains("# User Context"));
        // Files should NOT have been auto-created — UI relies on absence to
        // render its empty state.
        assert!(!d.path().join(WORKSPACE_MD).exists());
        assert!(!d.path().join(USER_MD).exists());
    }

    #[test]
    fn build_prompt_section_returns_none_outside_workspace() {
        let d = TempDir::new().unwrap();
        // No `.houston/` => not a real workspace; skip injection.
        assert!(build_prompt_section(d.path()).is_none());
    }
}
