//! Recovery probe when a step reports Composio connection failure in prose.

use crate::error::{CoreError, CoreResult};
use crate::workflows::connection_blocker::parse_connection_blocker;
use crate::workflows::dispatcher::{DispatchOutcome, StepContext, WorkflowDispatcher};
use crate::workflows::keys::step_session_key;
use crate::workflows::runs as workflow_runs;
use crate::workflows::step_verify::has_action_evidence;
use crate::workflows::types::{
    Workflow, WorkflowConnectionBlocker, WorkflowRun, WorkflowStep,
};
use std::path::Path;
use std::sync::Arc;

pub const PROBE_NO_BLOCKER: &str = "NO_BLOCKER";

/// True when prose likely reports a Composio connection failure without a marker.
pub fn looks_like_connection_failure(text: &str) -> bool {
    if has_action_evidence(text) {
        return false;
    }
    let lower = text.to_ascii_lowercase();

    const CLI: &[&str] = &[
        "no active connection",
        "no connected account",
        "not connected to composio",
    ];
    if CLI.iter().any(|s| lower.contains(s)) {
        return true;
    }

    if lower.contains("not connected") {
        return true;
    }
    if lower.contains("no está conectado") || lower.contains("não está conectado") {
        return true;
    }

    if lower.contains("composio") {
        const FAILURE_WORDS: &[&str] = &[
            "not connected",
            "no connection",
            "missing connection",
            "unconnected",
            "disconnected",
            "no está conectado",
            "não está conectado",
            "sin conexión",
            "sem conexão",
            "connect your",
            "conecta",
            "conectar",
        ];
        if FAILURE_WORDS.iter().any(|w| lower.contains(w)) {
            return true;
        }
    }

    false
}

pub fn build_probe_prompt(failed_summary: &str) -> String {
    format!(
        "Internal recovery probe. The previous workflow step turn reported a possible \
Composio connection problem but did not emit the required marker.\n\n\
Previous step output:\n{failed_summary}\n\n\
Re-read that output. If a Composio sign-in or toolkit connection is still required, \
output exactly one `<!--houston:workflow-connection {{...}}-->` marker and nothing else. \
If the step actually succeeded or the failure was unrelated to Composio connections, \
output exactly `{PROBE_NO_BLOCKER}` and nothing else. \
No prose, questions, or explanations."
    )
}

#[derive(Debug, PartialEq, Eq)]
pub enum ProbeOutcome {
    Blocker(WorkflowConnectionBlocker),
    NoBlocker,
    Failed,
}

pub fn probe_result(text: &str) -> ProbeOutcome {
    if let Some(blocker) = parse_connection_blocker(text) {
        return ProbeOutcome::Blocker(blocker);
    }
    let trimmed = text.trim();
    if trimmed == PROBE_NO_BLOCKER || trimmed.ends_with(PROBE_NO_BLOCKER) {
        return ProbeOutcome::NoBlocker;
    }
    ProbeOutcome::Failed
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum AfterProbe {
    WaitingForConnection(WorkflowConnectionBlocker),
    Continue,
    Failed,
}

pub(crate) fn interpret_probe(probe: &DispatchOutcome) -> AfterProbe {
    if probe.error.is_some() {
        return AfterProbe::Failed;
    }
    match probe_result(&probe.response_text) {
        ProbeOutcome::Blocker(blocker) => AfterProbe::WaitingForConnection(blocker),
        ProbeOutcome::NoBlocker => AfterProbe::Continue,
        ProbeOutcome::Failed => AfterProbe::Failed,
    }
}

pub async fn run_connection_probe(
    dispatcher: Arc<dyn WorkflowDispatcher>,
    agent_path: &str,
    root: &Path,
    workflow: &Workflow,
    run: &WorkflowRun,
    step: &WorkflowStep,
    failed_summary: &str,
) -> DispatchOutcome {
    let session_key = step_session_key(&workflow.id, &run.id, &step.id);
    let prompt = build_probe_prompt(failed_summary);
    dispatcher
        .dispatch_step(StepContext {
            agent_path,
            working_dir: root,
            workflow,
            run,
            step,
            session_key: &session_key,
            prompt: &prompt,
        })
        .await
}

/// Runs a recovery probe when prose looks like a connection failure. `None` = no probe needed.
pub(crate) async fn maybe_recover_connection(
    dispatcher: Arc<dyn WorkflowDispatcher>,
    agent_path: &str,
    root: &Path,
    workflow: &Workflow,
    run_id: &str,
    step_id: &str,
    summary: &str,
) -> CoreResult<Option<AfterProbe>> {
    if !looks_like_connection_failure(summary) {
        return Ok(None);
    }
    let run = workflow_runs::find_by_id(root, run_id)?;
    let step = run
        .plan
        .as_ref()
        .and_then(|p| p.steps.iter().find(|s| s.id == step_id))
        .cloned()
        .ok_or_else(|| {
            CoreError::Internal(format!(
                "workflow run {run_id} missing plan step {step_id} for connection probe"
            ))
        })?;
    let probe = run_connection_probe(
        dispatcher,
        agent_path,
        root,
        workflow,
        &run,
        &step,
        summary,
    )
    .await;
    Ok(Some(interpret_probe(&probe)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workflows::types::WorkflowConnectionBlocker;

    #[test]
    fn detects_spanish_prose_connection_failure() {
        let text = "No pude crear la carpeta porque Google Drive no está conectado en Composio. \
Resultado del intento: No active connection for toolkit googledrive";
        assert!(looks_like_connection_failure(text));
    }

    #[test]
    fn ignores_successful_action_with_link() {
        let text = "Created doc at https://docs.google.com/document/d/abc123";
        assert!(!looks_like_connection_failure(text));
    }

    #[test]
    fn probe_result_parses_marker() {
        let text = r#"<!--houston:workflow-connection {"type":"composio_toolkit","toolkit":"gmail"}-->"#;
        assert_eq!(
            probe_result(text),
            ProbeOutcome::Blocker(WorkflowConnectionBlocker::ComposioToolkit {
                toolkit: "gmail".into()
            })
        );
    }

    #[test]
    fn probe_result_accepts_no_blocker() {
        assert_eq!(probe_result(PROBE_NO_BLOCKER), ProbeOutcome::NoBlocker);
    }

    #[test]
    fn probe_result_fails_on_garbage() {
        assert_eq!(
            probe_result("I still cannot connect Gmail."),
            ProbeOutcome::Failed
        );
    }

    #[test]
    fn interpret_probe_maps_dispatch_error_to_failed() {
        assert_eq!(
            interpret_probe(&DispatchOutcome {
                response_text: String::new(),
                error: Some("timeout".into()),
            }),
            AfterProbe::Failed
        );
    }
}
