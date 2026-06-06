//! Engine-side [`WorkflowDispatcher`] on top of `session_runner`.

use crate::agents::prompt as agent_prompt;
use crate::sessions::{self, SessionRuntime};
use crate::workflows::dispatcher::{
    DispatchOutcome, PlannerContext, StepContext, SynthesisContext, WorkflowDispatcher,
};
use async_trait::async_trait;
use houston_agents_conversations::session_runner::{self, PersistOptions};
use houston_db::Database;
use houston_ui_events::DynEventSink;
pub struct EngineWorkflowDispatcher {
    pub rt: SessionRuntime,
    pub events: DynEventSink,
    pub db: Database,
    pub app_system_prompt: String,
}

#[async_trait]
impl WorkflowDispatcher for EngineWorkflowDispatcher {
    async fn dispatch_planner(&self, ctx: PlannerContext<'_>) -> DispatchOutcome {
        self.dispatch_turn(
            ctx.agent_path,
            ctx.working_dir,
            &ctx.run.session_key,
            ctx.prompt,
            None,
            None,
            None,
        )
        .await
    }

    async fn dispatch_step(&self, ctx: StepContext<'_>) -> DispatchOutcome {
        let resolved = sessions::resolve_provider(ctx.working_dir);
        let provider = ctx
            .step
            .provider
            .as_deref()
            .and_then(|p| p.parse().ok())
            .unwrap_or(resolved.provider);
        let model = ctx.step.model.clone().or(resolved.model);
        let effort = ctx
            .step
            .effort
            .clone()
            .or_else(|| sessions::resolve_effort(ctx.working_dir, provider));
        self.dispatch_turn(
            ctx.agent_path,
            ctx.working_dir,
            ctx.session_key,
            ctx.prompt,
            Some(provider),
            model,
            effort,
        )
        .await
    }

    async fn dispatch_synthesis(&self, ctx: SynthesisContext<'_>) -> DispatchOutcome {
        self.dispatch_turn(
            ctx.agent_path,
            ctx.working_dir,
            &ctx.run.session_key,
            ctx.prompt,
            None,
            None,
            None,
        )
        .await
    }
}

impl EngineWorkflowDispatcher {
    async fn dispatch_turn(
        &self,
        agent_path: &str,
        working_dir: &std::path::Path,
        session_key: &str,
        prompt: &str,
        provider: Option<houston_terminal_manager::Provider>,
        model: Option<String>,
        effort: Option<String>,
    ) -> DispatchOutcome {
        let _guard = self.rt.acquire_workdir(working_dir).await;
        if let Err(e) = agent_prompt::seed_agent(working_dir) {
            return DispatchOutcome {
                response_text: String::new(),
                error: Some(format!("seed failed: {e}")),
            };
        }
        let agent_context = agent_prompt::build_agent_context(working_dir, None, None);
        let system_prompt = if self.app_system_prompt.is_empty() {
            agent_context
        } else {
            format!("{}\n\n---\n\n{agent_context}", self.app_system_prompt)
        };
        let resolved = sessions::resolve_provider(working_dir);
        let provider = provider.unwrap_or(resolved.provider);
        let model = model.or(resolved.model);
        let effort = effort.or_else(|| sessions::resolve_effort(working_dir, provider));
        let agent_key = format!(
            "{}:{}:{}",
            working_dir.to_string_lossy(),
            provider,
            session_key
        );
        let sid_handle = self
            .rt
            .session_ids
            .get_for_session(&agent_key, working_dir, session_key, provider)
            .await;
        let handle = session_runner::spawn_and_monitor(
            self.events.clone(),
            agent_path.to_string(),
            session_key.to_string(),
            prompt.to_string(),
            None,
            None,
            working_dir.to_path_buf(),
            Some(system_prompt),
            Some(sid_handle),
            Some(PersistOptions {
                db: self.db.clone(),
                source: "workflow".into(),
                user_message: Some(prompt.to_string()),
                claude_session_id: None,
                lifecycle: None,
            }),
            Some(self.rt.pid_map.clone()),
            provider,
            model,
            effort,
        );
        match handle.await {
            Ok(result) => DispatchOutcome {
                response_text: result.response_text.unwrap_or_default(),
                error: result.error,
            },
            Err(e) => DispatchOutcome {
                response_text: String::new(),
                error: Some(format!("session task failed: {e}")),
            },
        }
    }
}
