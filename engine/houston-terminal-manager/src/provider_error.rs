//! Legacy holder for the user-visible "session ended due to malformed
//! provider JSON" message.
//!
//! The detection function previously here moved to
//! [`crate::provider::detect_malformed_provider_json`] (the typed
//! Anthropic stderr classifier promotes the same pattern to a
//! [`crate::ProviderError::MalformedResponse`]). The message constant
//! stays here because `claude_runner` uses it to surface a session-end
//! status independent of the typed feed-item path.

pub const MALFORMED_PROVIDER_JSON_MESSAGE: &str =
    "Claude could not read this conversation because it contains broken characters. Remove unusual pasted symbols or start a new mission, then try again.";
