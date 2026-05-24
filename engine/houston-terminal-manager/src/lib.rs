//! houston-terminal-manager — Claude/Codex CLI process management.
//!
//! Provides session spawning, NDJSON stream parsing, event pumping,
//! concurrency control, and PATH resolution for AI CLI tools.

pub mod auth_error;
pub mod claude_install_path;
pub mod claude_path;
mod claude_runner;
mod cli_process;
mod codex_command;
pub mod codex_parser;
mod codex_runner;
pub mod concurrency;
pub mod gemini_home;
pub mod gemini_parser;
mod gemini_parser_state;
mod gemini_runner;
mod life_runner;
pub mod manager;
pub mod parser;
pub mod provider;
pub mod provider_auth;
mod provider_error;
pub mod provider_error_kind;
mod session_dispatch;
pub mod session_io;
pub mod session_pump;
mod session_update;
mod stderr_filter;
pub mod types;

// Re-export key types for convenience.
pub use codex_parser::{extract_thread_id, parse_codex_event, CodexAccumulator};
pub use gemini_parser::{parse_gemini_event, GeminiAccumulator};
pub use manager::{SessionHandle, SessionManager};
pub use parser::{extract_session_id, parse_event, StreamAccumulator};
pub use provider::{InstallSource, Provider, ProviderAdapter};
pub use provider_auth::ProviderAuthState;
pub use provider_error_kind::{
    AuthFailureCause, ModelUnavailableReason, ProviderError, QuotaScope,
};
pub use session_update::SessionUpdate;
pub use types::{
    ClaudeEvent, ContentBlock, FeedItem, FileChanges, SessionFeedBuffer, SessionStatus,
    ToolRuntimeErrorKind,
};
