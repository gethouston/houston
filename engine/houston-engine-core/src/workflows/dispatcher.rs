//! Transport-neutral workflow session dispatch trait.

use crate::workflows::types::{Workflow, WorkflowRun, WorkflowStep};
use async_trait::async_trait;
use std::path::Path;

/// Outcome of a single planner, step, or synthesis session.
#[derive(Debug, Default, Clone)]
pub struct DispatchOutcome {
    pub response_text: String,
    pub error: Option<String>,
}

pub struct PlannerContext<'a> {
    pub agent_path: &'a str,
    pub working_dir: &'a Path,
    pub workflow: &'a Workflow,
    pub run: &'a WorkflowRun,
    pub prompt: &'a str,
}

pub struct StepContext<'a> {
    pub agent_path: &'a str,
    pub working_dir: &'a Path,
    pub workflow: &'a Workflow,
    pub run: &'a WorkflowRun,
    pub step: &'a WorkflowStep,
    pub session_key: &'a str,
    pub prompt: &'a str,
}

pub struct SynthesisContext<'a> {
    pub agent_path: &'a str,
    pub working_dir: &'a Path,
    pub workflow: &'a Workflow,
    pub run: &'a WorkflowRun,
    pub prompt: &'a str,
}

/// Runs planner, step, and synthesis turns. Engine provides a real impl;
/// tests inject canned replies.
#[async_trait]
pub trait WorkflowDispatcher: Send + Sync {
    async fn dispatch_planner(&self, ctx: PlannerContext<'_>) -> DispatchOutcome;
    async fn dispatch_step(&self, ctx: StepContext<'_>) -> DispatchOutcome;
    async fn dispatch_synthesis(&self, ctx: SynthesisContext<'_>) -> DispatchOutcome;
}
