//! Saved workflows index for system prompt injection.

use crate::workflows::defs;
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workflows::defs::create as create_workflow;
    use crate::workflows::types::NewWorkflow;
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
            },
        )
        .unwrap();
        let b = create_workflow(
            d.path(),
            NewWorkflow {
                name: "Onboarding".into(),
                description: "Welcome new hires".into(),
                plan_prompt: "Plan onboarding".into(),
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
            },
        )
        .unwrap();

        let section = build_prompt_section(d.path()).expect("section");
        assert!(section.contains(&format!("  * {} -- Quick task", w.id)));
        assert!(!section.contains("Quick task:"));
    }
}
