//! Houston product prompts, the authoritative identity copy for the Houston
//! desktop app.
//!
//! These strings are the product layer. The engine is prompt-agnostic: it
//! assembles per-agent context from disk, while this module defines how the
//! Houston desktop agent behaves and speaks.

mod base;
mod integrations;
mod onboarding;
mod routines;
mod skills_memory;
mod questions;
mod workflows;

pub use base::HOUSTON_SYSTEM_PROMPT;
pub use integrations::COMPOSIO_GUIDANCE;
pub use onboarding::ONBOARDING_GUIDANCE;
pub use routines::ROUTINES_GUIDANCE;
pub use skills_memory::SELF_IMPROVEMENT_GUIDANCE;
pub use questions::QUESTIONS_GUIDANCE;
pub use workflows::WORKFLOWS_GUIDANCE;

/// Build the composite system prompt the engine uses as its fallback.
/// Order: base identity, skills/memory guidance, routines guidance, workflows guidance, Composio guidance.
pub fn system_prompt() -> String {
    format!(
        "{HOUSTON_SYSTEM_PROMPT}\n\n---\n\n{SELF_IMPROVEMENT_GUIDANCE}\n\n---\n\n{ROUTINES_GUIDANCE}\n\n---\n\n{WORKFLOWS_GUIDANCE}\n\n---\n\n{QUESTIONS_GUIDANCE}{}{}",
        COMPOSIO_GUIDANCE,
        integrations::COMPOSIO_WINDOWS_SHELL,
    )
}

/// Onboarding prompt suffix, appended after `system_prompt()` on first-run sessions.
pub fn onboarding_prompt() -> String {
    ONBOARDING_GUIDANCE.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn system_prompt_contains_new_interaction_gates() {
        let prompt = system_prompt();

        assert!(prompt.contains("# Houston Context"));
        assert!(prompt.contains("# Interaction Procedure"));
        assert!(prompt.contains("# Load Relevant Guidance"));
        assert!(prompt.contains("Classify the request"));
        assert!(prompt.contains("Required integrations"));
        assert!(prompt.contains("Routine request"));
        assert!(prompt.contains(
            "Ask for explicit approval before work that will change persistent user data"
        ));
    }

    #[test]
    fn memory_guidance_requires_user_opt_in() {
        let prompt = system_prompt();

        assert!(prompt.contains("Want me to remember that for next time?"));
        assert!(prompt.contains("Save a learning only when"));
        assert!(!prompt.contains("Save ALL"));
        assert!(!prompt.contains("do NOT wait"));
    }

    #[test]
    fn skill_guidance_omits_legacy_fields() {
        let prompt = system_prompt();

        assert!(!prompt.contains("tags:"));
        assert!(!prompt.contains("inputs"));
        assert!(!prompt.contains("prompt_template"));
    }

    #[test]
    fn onboarding_uses_current_skill_layout() {
        let prompt = onboarding_prompt();

        assert!(prompt.contains(".agents/skills/core-workflow/SKILL.md"));
        assert!(prompt.contains("## Procedure"));
        assert!(!prompt.contains("core-workflow.md"));
        assert!(!prompt.contains("skill.sh"));
    }

    #[test]
    fn routine_guidance_maps_recurring_requests_to_routines() {
        let prompt = system_prompt();

        assert!(prompt.contains("## How-To Guidance: Routines"));
        assert!(prompt.contains("explicitly says \"routine\""));
        assert!(prompt.contains("treat it as a Routine setup or update"));
        assert!(
            prompt.contains("Ask for approval before creating, enabling, or changing a Routine")
        );
    }

    #[test]
    fn workflow_guidance_describes_trigger_marker() {
        let prompt = system_prompt();

        assert!(prompt.contains("## How-To Guidance: Workflows"));
        assert!(prompt.contains("<!--houston:workflow "));
        assert!(prompt.contains("workflowId"));
        assert!(prompt.contains("planPrompt"));
        assert!(prompt.contains("Do not start a Workflow"));
    }

    #[test]
    fn workflow_guidance_auto_detects_multi_step_and_clarifies_first() {
        let prompt = system_prompt();

        assert!(prompt.contains("more than 3 distinct actions"));
        assert!(prompt.contains("run in parallel"));
        assert!(prompt.contains("## Clarify before planning"));
        assert!(prompt.contains("structured question marker"));
        assert!(prompt.contains(
            "Do not emit a workflow marker on a turn where you are still asking questions"
        ));
        assert!(prompt.contains("fold the user's answers into `planPrompt`"));
    }

    #[test]
    fn workflow_guidance_requires_plan_language_match_chat() {
        let prompt = system_prompt();

        assert!(prompt.contains(
            "Write `planPrompt`, `name`, and `description` in the user's current chat language"
        ));
        assert!(prompt.contains("Keep brand names and code identifiers untranslated"));
    }

    #[test]
    fn questions_guidance_describes_question_marker() {
        let prompt = system_prompt();

        assert!(prompt.contains("## How-To Guidance: Structured questions"));
        assert!(prompt.contains("<!--houston:question "));
        assert!(prompt.contains("allowFreeText"));
        assert!(prompt.contains("Emit at most one question marker per reply"));
    }

    #[test]
    fn composio_guidance_requires_inline_json() {
        let prompt = system_prompt();
        assert!(prompt.contains("inline JSON on"));
        assert!(prompt.contains("GMAIL_FETCH_EMAILS"));
    }

    #[cfg(windows)]
    #[test]
    fn composio_guidance_includes_powershell_notes_on_windows() {
        let prompt = system_prompt();
        assert!(prompt.contains("## Windows PowerShell"));
        assert!(prompt.contains("NativeCommandError"));
    }
}
