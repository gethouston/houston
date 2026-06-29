//! Single dispatch site mapping a provider to its session-runner module.
//!
//! Runners (claude_runner.rs, codex_command.rs / spawn_codex) parse very
//! different stream formats and have non-trivial spawn-side state. Rather
//! than push their entire surface (build_command + parse_line + retry
//! policy + stderr classification) onto the [`ProviderAdapter`] trait, we
//! keep them as standalone modules and let this file own the one match
//! that picks among them.
//!
//! REASON for the standalone-modules + central-dispatch shape (option (c)
//! in the design notes): each runner's parser is hundreds of lines of
//! provider-specific event handling and fits naturally as a module of
//! its own. Putting that behind a `dyn` trait would either bloat the
//! adapter trait or force every adapter to re-export a sub-trait — both
//! cost more than this single dispatch site, which is exactly two arms
//! today and grows by one line per provider. Reconsider promoting the
//! runner to its own trait once a third or fourth provider exposes a
//! genuinely different lifecycle (e.g. a streaming HTTP transport
//! instead of a CLI subprocess).

use crate::claude_runner::spawn_claude;
use crate::codex_runner::spawn_codex;
use crate::gemini_runner::spawn_gemini;
use crate::session_update::SessionUpdate;
use crate::types::SessionStatus;
use crate::Provider;
use tokio::sync::mpsc;

/// Spawn the right CLI runner for `provider`, forwarding the session
/// updates onto `tx`. The caller is expected to have already emitted
/// `SessionStatus::Starting` on `tx` (the manager does this).
#[allow(clippy::too_many_arguments)]
pub(crate) async fn dispatch(
    tx: &mpsc::UnboundedSender<SessionUpdate>,
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
    disable_all_tools: bool,
) {
    match provider.id() {
        "anthropic" => {
            spawn_claude(
                tx,
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
            )
            .await;
        }
        "openai" | "openrouter" => {
            spawn_codex(
                tx,
                provider,
                prompt,
                resume_session_id,
                resume_fallback_prompt,
                working_dir,
                model,
                effort,
                system_prompt,
            )
            .await;
        }
        "gemini" => {
            // Gemini's CLI takes no `effort` / `mcp_config` /
            // tool-toggle flags today; those parameters are
            // intentionally not forwarded. If gemini-cli grows an
            // equivalent in a future release, plumb it through here
            // rather than silently swallowing.
            spawn_gemini(
                tx,
                provider,
                prompt,
                resume_session_id,
                working_dir,
                model,
                system_prompt,
            )
            .await;
        }
        unknown => {
            // Provider parsed successfully (so it lives in the registry)
            // but we have no runner wired up for it. This is a wiring
            // bug — surface it loudly rather than silently doing nothing.
            let _ = tx.send(SessionUpdate::Status(SessionStatus::Error(format!(
                "no session runner registered for provider {unknown:?}"
            ))));
        }
    }
}
