//! Session-runner abstraction + the dispatch site mapping a provider to a runner.
//!
//! A [`SessionRunner`] drives one agent turn, forwarding [`SessionUpdate`]s
//! onto the caller's channel. Today the only lifecycle is a local CLI
//! subprocess ([`CliRunner`], wrapping `claude_runner` / `codex_runner` /
//! `gemini_runner`) — their parsers are hundreds of lines of provider-specific
//! NDJSON handling and stay as standalone modules; [`CliRunner`] owns the one
//! `match` that picks among them.
//!
//! The trait exists so a provider with a genuinely different lifecycle — e.g.
//! a streaming transport to a remote engine rather than a CLI subprocess — can
//! be added as a sibling impl without touching the call site in `manager.rs`.
//! This is the promotion the earlier central-dispatch comment anticipated
//! ("reconsider promoting the runner to its own trait once a … provider
//! exposes a genuinely different lifecycle, e.g. a streaming HTTP transport
//! instead of a CLI subprocess"). The boxed-future return keeps the trait
//! object-safe without the `async-trait` macro, mirroring the `ProbeFuture`
//! idiom in [`crate::provider`].

use crate::claude_runner::spawn_claude;
use crate::codex_runner::spawn_codex;
use crate::gemini_runner::spawn_gemini;
use crate::session_update::SessionUpdate;
use crate::types::SessionStatus;
use crate::Provider;
use std::future::Future;
use std::pin::Pin;
use tokio::sync::mpsc;

/// Future returned by [`SessionRunner::spawn`]. Boxed so the trait stays
/// object-safe without the `async-trait` macro — same idiom as the
/// `ProbeFuture` used by `ProviderAdapter::probe_auth`.
pub(crate) type SpawnFuture<'a> = Pin<Box<dyn Future<Output = ()> + Send + 'a>>;

/// Drives one agent turn for a provider, forwarding session updates onto `tx`.
///
/// The caller is expected to have already emitted `SessionStatus::Starting`
/// on `tx` (the manager does this). Implementations own the full spawn-side
/// lifecycle for their transport: process management for a CLI runner;
/// connection + stream pump for a future remote-transport runner.
pub(crate) trait SessionRunner: Send + Sync {
    #[allow(clippy::too_many_arguments)]
    fn spawn<'a>(
        &'a self,
        tx: &'a mpsc::UnboundedSender<SessionUpdate>,
        provider: Provider,
        prompt: String,
        resume_session_id: Option<String>,
        working_dir: Option<std::path::PathBuf>,
        model: Option<String>,
        effort: Option<String>,
        system_prompt: Option<String>,
        mcp_config: Option<std::path::PathBuf>,
        disable_builtin_tools: bool,
        disable_all_tools: bool,
    ) -> SpawnFuture<'a>;
}

/// Runs a session as a local CLI subprocess (claude / codex / gemini).
///
/// Each provider's stream format and spawn-side state differ enough that the
/// runners stay as standalone modules; this impl owns the one `match` that
/// routes to them.
pub(crate) struct CliRunner;

static CLI_RUNNER: CliRunner = CliRunner;

impl SessionRunner for CliRunner {
    #[allow(clippy::too_many_arguments)]
    fn spawn<'a>(
        &'a self,
        tx: &'a mpsc::UnboundedSender<SessionUpdate>,
        provider: Provider,
        prompt: String,
        resume_session_id: Option<String>,
        working_dir: Option<std::path::PathBuf>,
        model: Option<String>,
        effort: Option<String>,
        system_prompt: Option<String>,
        mcp_config: Option<std::path::PathBuf>,
        disable_builtin_tools: bool,
        disable_all_tools: bool,
    ) -> SpawnFuture<'a> {
        Box::pin(async move {
            match provider.id() {
                "anthropic" => {
                    spawn_claude(
                        tx,
                        provider,
                        prompt,
                        resume_session_id,
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
                "openai" => {
                    spawn_codex(
                        tx,
                        provider,
                        prompt,
                        resume_session_id,
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
        })
    }
}

/// Select the [`SessionRunner`] for `provider`.
///
/// Every provider currently runs as a local CLI subprocess, so this returns
/// [`CliRunner`]. A provider with a different lifecycle (e.g. a remote
/// streaming transport) would branch here to its own runner.
pub(crate) fn runner_for(_provider: Provider) -> &'static dyn SessionRunner {
    &CLI_RUNNER
}

/// Spawn the right runner for `provider`, forwarding the session updates onto
/// `tx`. Thin delegating shim over [`runner_for`], kept for call-site
/// stability (`manager.rs` calls this). The caller is expected to have already
/// emitted `SessionStatus::Starting` on `tx`.
#[allow(clippy::too_many_arguments)]
pub(crate) async fn dispatch(
    tx: &mpsc::UnboundedSender<SessionUpdate>,
    provider: Provider,
    prompt: String,
    resume_session_id: Option<String>,
    working_dir: Option<std::path::PathBuf>,
    model: Option<String>,
    effort: Option<String>,
    system_prompt: Option<String>,
    mcp_config: Option<std::path::PathBuf>,
    disable_builtin_tools: bool,
    disable_all_tools: bool,
) {
    runner_for(provider)
        .spawn(
            tx,
            provider,
            prompt,
            resume_session_id,
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
