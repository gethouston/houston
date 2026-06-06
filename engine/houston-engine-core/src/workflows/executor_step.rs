//! Per-step worktree setup, session-slot acquisition, dispatch, and completion.

use crate::error::CoreResult;
use crate::workflows::dispatcher::{DispatchOutcome, StepContext, WorkflowDispatcher};
use crate::workflows::executor_sched::emit_step;
use crate::workflows::keys::step_session_key;
use crate::workflows::planner::emit_runs_changed;
use crate::workflows::runs as workflow_runs;
use crate::workflows::step_prompt::build_step_prompt;
use crate::workflows::step_verify::step_reapproval_only;
use crate::workflows::types::{Workflow, WorkflowStep};
use crate::worktree::{self, CreateWorktreeRequest, RemoveWorktreeRequest};
use houston_terminal_manager::concurrency;
use houston_ui_events::DynEventSink;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::task::JoinSet;

pub(crate) struct StepTaskResult {
    pub step_id: String,
    pub outcome: DispatchOutcome,
    pub worktree_path: Option<String>,
}

pub(crate) fn spawn_step(
    join_set: &mut JoinSet<StepTaskResult>,
    dispatcher: Arc<dyn WorkflowDispatcher>,
    agent_path: String,
    root: PathBuf,
    workflow: Workflow,
    run_id: String,
    step: WorkflowStep,
) {
    join_set.spawn(async move {
        let _session_slot = match concurrency::session_sem().acquire().await {
            Ok(permit) => permit,
            Err(e) => {
                return StepTaskResult {
                    step_id: step.id,
                    outcome: DispatchOutcome {
                        response_text: String::new(),
                        error: Some(format!("session concurrency slot unavailable: {e}")),
                    },
                    worktree_path: None,
                };
            }
        };

        let wid = workflow.id.clone();
        let session_key = step_session_key(&wid, &run_id, &step.id);
        let (workdir, worktree_path) = match prepare_workdir(&root, &step, &run_id).await {
            Ok(v) => v,
            Err(e) => {
                return StepTaskResult {
                    step_id: step.id,
                    outcome: DispatchOutcome {
                        response_text: String::new(),
                        error: Some(e.to_string()),
                    },
                    worktree_path: None,
                };
            }
        };
        let run = match workflow_runs::find_by_id(&root, &run_id) {
            Ok(r) => r,
            Err(e) => {
                return StepTaskResult {
                    step_id: step.id,
                    outcome: DispatchOutcome {
                        response_text: String::new(),
                        error: Some(e.to_string()),
                    },
                    worktree_path,
                };
            }
        };
        if let Some(ref wt) = worktree_path {
            if let Err(e) = workflow_runs::patch_step(&root, &run_id, &step.id, |s| {
                s.worktree_path = Some(wt.clone());
            }) {
                return StepTaskResult {
                    step_id: step.id,
                    outcome: DispatchOutcome {
                        response_text: String::new(),
                        error: Some(e.to_string()),
                    },
                    worktree_path: Some(wt.clone()),
                };
            }
        }
        let approved = run
            .steps
            .iter()
            .find(|s| s.step_id == step.id)
            .is_some_and(|s| s.approved);
        let plan_steps = run
            .plan
            .as_ref()
            .map(|p| p.steps.as_slice())
            .unwrap_or(&[]);
        let prompt = build_step_prompt(&workflow, plan_steps, &run, &step, approved);
        let outcome = dispatcher
            .dispatch_step(StepContext {
                agent_path: agent_path.as_str(),
                working_dir: workdir.as_path(),
                workflow: &workflow,
                run: &run,
                step: &step,
                session_key: &session_key,
                prompt: &prompt,
            })
            .await;
        StepTaskResult {
            step_id: step.id,
            outcome,
            worktree_path,
        }
    });
}

async fn prepare_workdir(
    repo: &Path,
    step: &WorkflowStep,
    run_id: &str,
) -> CoreResult<(PathBuf, Option<String>)> {
    if !step.use_worktree {
        return Ok((repo.to_path_buf(), None));
    }
    let name = format!("wf-{run_id}-{}", step.id);
    let info = worktree::create_worktree(CreateWorktreeRequest {
        repo_path: repo.to_string_lossy().to_string(),
        name,
        branch: None,
    })
    .await?;
    Ok((PathBuf::from(&info.path), Some(info.path)))
}

pub(crate) async fn finish_step(
    events: &DynEventSink,
    agent_path: &str,
    root: &Path,
    run_id: &str,
    result: StepTaskResult,
) -> CoreResult<bool> {
    if let Some(wt) = result.worktree_path.as_deref() {
        if let Err(e) = worktree::remove_worktree(RemoveWorktreeRequest {
            repo_path: root.to_string_lossy().to_string(),
            worktree_path: wt.to_string(),
        })
        .await
        {
            workflow_runs::patch_step(root, run_id, &result.step_id, |s| {
                s.status = "error".into();
                s.summary = Some(format!("worktree cleanup failed: {e}"));
                s.worktree_path = None;
            })?;
            emit_step(events, agent_path, run_id, &result.step_id);
            emit_runs_changed(events, agent_path);
            return Ok(false);
        }
    }

    if let Some(err) = result.outcome.error {
        workflow_runs::patch_step(root, run_id, &result.step_id, |s| {
            s.status = "error".into();
            s.summary = Some(err.clone());
            s.worktree_path = None;
        })?;
        emit_step(events, agent_path, run_id, &result.step_id);
        emit_runs_changed(events, agent_path);
        return Ok(false);
    }

    let summary = result.outcome.response_text;
    let run = workflow_runs::find_by_id(root, run_id)?;
    let requires_approval = run
        .plan
        .as_ref()
        .and_then(|p| p.steps.iter().find(|s| s.id == result.step_id))
        .is_some_and(|s| s.requires_approval);
    if requires_approval && step_reapproval_only(&summary) {
        let err = "Step completed without performing the approved action. \
The agent re-asked for approval instead of using connected-app tools."
            .to_string();
        workflow_runs::patch_step(root, run_id, &result.step_id, |s| {
            s.status = "error".into();
            s.summary = Some(err.clone());
            s.worktree_path = None;
        })?;
        emit_step(events, agent_path, run_id, &result.step_id);
        emit_runs_changed(events, agent_path);
        return Ok(false);
    }
    workflow_runs::patch_step(root, run_id, &result.step_id, |s| {
        s.status = "done".into();
        s.summary = Some(summary.clone());
        s.worktree_path = None;
    })?;
    emit_step(events, agent_path, run_id, &result.step_id);
    emit_runs_changed(events, agent_path);
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workflows::types::StepState;
    use houston_ui_events::{DynEventSink, NoopEventSink};
    use std::sync::Arc;
    use tokio::process::Command;

    async fn git(dir: &Path, args: &[&str]) {
        let out = Command::new("git")
            .args(args)
            .current_dir(dir)
            .output()
            .await
            .unwrap();
        assert!(
            out.status.success(),
            "git {args:?}: {}",
            String::from_utf8_lossy(&out.stderr)
        );
    }

    async fn init_agent_repo(agent_root: &Path) {
        std::fs::create_dir_all(agent_root).unwrap();
        git(agent_root, &["init", "-b", "main"]).await;
        git(agent_root, &["config", "user.email", "test@test.test"]).await;
        git(agent_root, &["config", "user.name", "Test"]).await;
        git(agent_root, &["config", "commit.gpgsign", "false"]).await;
        std::fs::write(agent_root.join("README.md"), "hello").unwrap();
        git(agent_root, &["add", "."]).await;
        git(agent_root, &["commit", "-m", "init"]).await;
    }

    #[tokio::test]
    async fn finish_step_removes_worktree_on_done() {
        let tmp = tempfile::TempDir::new().unwrap();
        let agent = tmp.path().join("agent");
        init_agent_repo(&agent).await;

        let created = worktree::create_worktree(CreateWorktreeRequest {
            repo_path: agent.to_string_lossy().to_string(),
            name: "wf-run-step-a".into(),
            branch: None,
        })
        .await
        .unwrap();
        let wt_path = PathBuf::from(&created.path);
        assert!(wt_path.exists());

        let events: DynEventSink = Arc::new(NoopEventSink);
        let run = workflow_runs::create(&agent, "wf").unwrap();
        workflow_runs::update(
            &agent,
            &run.id,
            crate::workflows::types::WorkflowRunUpdate {
                steps: Some(vec![StepState {
                    step_id: "a".into(),
                    status: "running".into(),
                    approved: false,
                    summary: None,
                    worktree_path: Some(created.path.clone()),
                }]),
                ..Default::default()
            },
        )
        .unwrap();
        let run_id = run.id;

        let ok = finish_step(
            &events,
            "agent",
            &agent,
            &run_id,
            StepTaskResult {
                step_id: "a".into(),
                outcome: DispatchOutcome {
                    response_text: "done".into(),
                    error: None,
                },
                worktree_path: Some(created.path),
            },
        )
        .await
        .unwrap();
        assert!(ok);
        assert!(!wt_path.exists());

        let run = workflow_runs::find_by_id(&agent, &run_id).unwrap();
        let step = run.steps.iter().find(|s| s.step_id == "a").unwrap();
        assert_eq!(step.status, "done");
        assert!(step.worktree_path.is_none());
    }

    #[tokio::test]
    async fn finish_step_flags_reapproval_on_gated_step() {
        let tmp = tempfile::TempDir::new().unwrap();
        let agent = tmp.path().join("agent");
        std::fs::create_dir_all(&agent).unwrap();
        let events: DynEventSink = Arc::new(NoopEventSink);
        let run = workflow_runs::create(&agent, "wf").unwrap();
        let plan = crate::workflows::plan::parse_plan(
            r#"{"steps":[{"id":"write","task":"create doc","requires_approval":true}]}"#,
        )
        .unwrap();
        workflow_runs::update(
            &agent,
            &run.id,
            crate::workflows::types::WorkflowRunUpdate {
                plan: Some(plan),
                steps: Some(vec![crate::workflows::types::StepState {
                    step_id: "write".into(),
                    status: "running".into(),
                    approved: true,
                    summary: None,
                    worktree_path: None,
                }]),
                ..Default::default()
            },
        )
        .unwrap();

        let ok = finish_step(
            &events,
            "agent",
            &agent,
            &run.id,
            StepTaskResult {
                step_id: "write".into(),
                outcome: DispatchOutcome {
                    response_text: "I need your approval before creating the doc.".into(),
                    error: None,
                },
                worktree_path: None,
            },
        )
        .await
        .unwrap();
        assert!(!ok);
        let run = workflow_runs::find_by_id(&agent, &run.id).unwrap();
        let step = run.steps.iter().find(|s| s.step_id == "write").unwrap();
        assert_eq!(step.status, "error");
    }
}
