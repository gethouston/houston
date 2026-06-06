use super::types::SessionStatus;
use crate::session_dispatch;
use crate::session_update::SessionUpdate;
use crate::Provider;
use tokio::sync::mpsc;

/// Handle to a running session — keeps the task alive via its JoinHandle.
pub struct SessionHandle {
    _task: tokio::task::JoinHandle<()>,
}

/// Spawns a Claude/Codex session and streams parsed events back.
pub struct SessionManager;

impl SessionManager {
    /// Start a new CLI session with the given prompt.
    ///
    /// Returns a receiver of session updates and a handle that keeps the task alive.
    /// All sessions use --dangerously-skip-permissions because they're automated.
    /// Safety is controlled via system prompts and --disallowedTools / --tools flags.
    #[allow(clippy::too_many_arguments)]
    pub fn spawn_session(
        provider: Provider,
        prompt: String,
        resume_session_id: Option<String>,
        resume_fallback_prompt: Option<String>,
        working_dir: Option<std::path::PathBuf>,
        model: Option<String>,
        effort: Option<String>,
        system_prompt: Option<String>,
        mcp_config: Option<std::path::PathBuf>,
        disable_builtin_tools: bool,
        // When true, disables ALL tools (--allowedTools ""). Use for pure conversation.
        disable_all_tools: bool,
        use_provider_sandbox: bool,
    ) -> (mpsc::UnboundedReceiver<SessionUpdate>, SessionHandle) {
        let (tx, rx) = mpsc::unbounded_channel();

        let handle = tokio::spawn(async move {
            let _ = tx.send(SessionUpdate::Status(SessionStatus::Starting));

            session_dispatch::dispatch(
                &tx,
                provider,
                prompt,
                resume_session_id,
                resume_fallback_prompt,
                working_dir,
                model,
                effort,
                system_prompt,
                mcp_config,
                disable_builtin_tools,
                disable_all_tools,
                use_provider_sandbox,
            )
            .await;
        });

        let session_handle = SessionHandle { _task: handle };
        (rx, session_handle)
    }
}
