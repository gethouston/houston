//! Saved workflows index and chat-linked pending-run context for system prompts.

use crate::workflows::defs;
use crate::workflows::runs as workflow_runs;
use crate::workflows::types::Workflow;
use std::path::Path;

/// Build a compact workflows section for agent context. Returns `None` when
/// there are no saved workflows or the list cannot be read.
pub fn build_prompt_section(root: &Path) -> Option<String> {
    let workflows = match defs::list(root) {
        Ok(list) => list,
        Err(e) => {
            tracing::warn!(
                "[workflows] failed to list workflows for agent context: {e} (root={})",
                root.display()
            );
            return None;
        }
    };
    if workflows.is_empty() {
        return None;
    }
    Some(render_section(&workflows))
}

fn render_section(workflows: &[Workflow]) -> String {
    let mut lines = vec![
        "# Available Workflows".to_string(),
        String::new(),
        "These saved multi-step workflows are available for this agent. Each has a stable id:"
            .to_string(),
    ];
    for w in workflows {
        let line = if w.description.trim().is_empty() {
            format!("  * {} -- {}", w.id, w.name)
        } else {
            format!("  * {} -- {}: {}", w.id, w.name, w.description)
        };
        lines.push(line);
    }
    lines.join("\n")
}

/// Inject the chat-linked workflow run awaiting plan review, if any.
pub fn build_chat_pending_run_section(
    root: &Path,
    chat_session_key: &str,
) -> Option<String> {
    let run = workflow_runs::find_chat_pending_run(root, chat_session_key).ok()??;
    let title = run
        .name
        .as_deref()
        .filter(|n| !n.trim().is_empty())
        .unwrap_or("Workflow");
    let mut lines = vec![
        "# Active workflow run (awaiting your review)".to_string(),
        String::new(),
        format!("runId: `{}`", run.id),
        format!("Title: {title}"),
        String::new(),
        "Steps:".to_string(),
    ];
    if let Some(plan) = &run.plan {
        for (idx, step) in plan.steps.iter().enumerate() {
            lines.push(format!("  {}. [{}] {}", idx + 1, step.id, step.task));
        }
    } else {
        lines.push("  (plan not loaded)".to_string());
    }
    Some(lines.join("\n"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workflows::defs::create as create_workflow;
    use crate::workflows::plan::parse_plan;
    use crate::workflows::runs::{
        create_inline, link_to_chat_session, update, find_chat_pending_run,
    };
    use crate::workflows::types::{InlineRunSpec, NewWorkflow, WorkflowRunUpdate};
    use tempfile::TempDir;

    #[test]
    fn empty_root_returns_none() {
        let d = TempDir::new().unwrap();
        assert!(build_prompt_section(d.path()).is_none());
    }

    #[test]
    fn lists_saved_workflows_with_ids_and_names() {
        let d = TempDir::new().unwrap();
        let a = create_workflow(
            d.path(),
            NewWorkflow {
                name: "Security audit".into(),
                description: "Scan the repo".into(),
                plan_prompt: "Plan a scan".into(),
                plan: None,
            },
        )
        .unwrap();
        let b = create_workflow(
            d.path(),
            NewWorkflow {
                name: "Onboarding".into(),
                description: "Welcome new hires".into(),
                plan_prompt: "Plan onboarding".into(),
                plan: None,
            },
        )
        .unwrap();

        let section = build_prompt_section(d.path()).expect("section");
        assert!(section.contains("# Available Workflows"));
        assert!(section.contains(&a.id));
        assert!(section.contains("Security audit"));
        assert!(section.contains("Scan the repo"));
        assert!(section.contains(&b.id));
        assert!(section.contains("Onboarding"));
    }

    #[test]
    fn omits_description_suffix_when_empty() {
        let d = TempDir::new().unwrap();
        let w = create_workflow(
            d.path(),
            NewWorkflow {
                name: "Quick task".into(),
                description: String::new(),
                plan_prompt: "Do it".into(),
                plan: None,
            },
        )
        .unwrap();

        let section = build_prompt_section(d.path()).expect("section");
        assert!(section.contains(&format!("  * {} -- Quick task", w.id)));
        assert!(!section.contains("Quick task:"));
    }

    #[test]
    fn chat_pending_run_section_lists_run_id_and_steps() {
        let d = TempDir::new().unwrap();
        let run = create_inline(
            d.path(),
            InlineRunSpec {
                plan_prompt: "Plan a launch".into(),
                name: Some("Launch plan".into()),
                description: None,
            },
        )
        .unwrap();
        link_to_chat_session(d.path(), &run.id, "chat-session-1").unwrap();
        let plan = parse_plan(
            r#"{"steps":[{"id":"draft","task":"Draft announcement","depends_on":[],"use_worktree":false,"requires_approval":false,"toolkits":[]}]}"#,
        )
        .unwrap();
        update(
            d.path(),
            &run.id,
            WorkflowRunUpdate {
                status: Some("awaiting_approval".into()),
                plan: Some(plan),
                ..Default::default()
            },
        )
        .unwrap();

        let section =
            build_chat_pending_run_section(d.path(), "chat-session-1").expect("section");
        assert!(section.contains("# Active workflow run (awaiting your review)"));
        assert!(section.contains(&format!("runId: `{}`", run.id)));
        assert!(section.contains("Draft announcement"));
    }

    #[test]
    fn chat_pending_run_section_omits_when_none() {
        let d = TempDir::new().unwrap();
        assert!(build_chat_pending_run_section(d.path(), "chat-session-1").is_none());
        assert!(find_chat_pending_run(d.path(), "chat-session-1").unwrap().is_none());
    }
}
