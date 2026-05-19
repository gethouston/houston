//! Stack recommender (V1 — keyword pre-filter + LLM pick, no embeddings).
//!
//! Public entry point: [`recommend`]. Given a plain-language user intent
//! and the list of toolkit slugs the user has already connected, return
//! a curated stack of 2-6 Composio toolkits with role/reason text for
//! each. End users never need to browse the 1000-toolkit catalog.
//!
//! Pipeline:
//!   1. [`matcher::tokenize`] the intent into lowercase tokens
//!   2. [`matcher::top_candidates`] picks the top-K toolkits from the
//!      enriched catalog by keyword/category match score
//!   3. [`llm_pick::pick`] hands them to the user's provider CLI
//!      (Claude `-p` / Codex `exec`) which chooses the final 2-6
//!   4. On any CLI failure, [`llm_pick::fallback_from_candidates`]
//!      returns the top-K as a stack with `llm_picked: false` so the
//!      frontend can show a softer confidence indicator
//!
//! Results are cached in-memory for 24h keyed by `(intent_normalized,
//! sorted_connected_slugs)` so repeat queries are cheap.

mod cache;
mod catalog;
mod llm_pick;
mod matcher;
mod types;

pub use types::{EnrichedToolkit, RecommendResult, StackEntry};

use houston_terminal_manager::Provider;

/// Maximum entries in the final returned stack when the LLM cannot run.
const FALLBACK_STACK_SIZE: usize = 5;

/// Public error type — kept narrow on purpose. The recommender either
/// succeeds with something (even a fallback) or reports a structural
/// problem the frontend should surface explicitly.
#[derive(Debug, thiserror::Error)]
pub enum RecommendError {
    #[error("intent must not be empty")]
    EmptyIntent,
    #[error("catalog has not been enriched yet — run scripts/enrich-composio-catalog.mjs")]
    CatalogEmpty,
    #[error("no toolkits matched the intent — try different wording")]
    NoMatches,
}

/// Recommend a stack of Composio toolkits for the user's intent.
///
/// `already_connected` is the list of toolkit slugs the user has
/// already authorized in Composio — used both to bias the LLM toward
/// reuse and to populate the `connected` flag on each stack entry.
///
/// `provider` selects which CLI to call for the LLM-pick step. Pass
/// the workspace's configured provider; the user has already logged
/// into that CLI via the normal Houston flow.
pub async fn recommend(
    intent: &str,
    already_connected: &[String],
    provider: Provider,
) -> Result<RecommendResult, RecommendError> {
    let intent_trimmed = intent.trim();
    if intent_trimmed.is_empty() {
        return Err(RecommendError::EmptyIntent);
    }
    if catalog::is_empty() {
        return Err(RecommendError::CatalogEmpty);
    }

    let cache_key = cache::key(intent_trimmed, already_connected);
    if let Some(hit) = cache::get(cache_key) {
        return Ok(hit);
    }

    let tokens = matcher::tokenize(intent_trimmed);
    let candidates =
        matcher::top_candidates(&tokens, catalog::toolkits(), matcher::TOP_K);

    if candidates.is_empty() {
        return Err(RecommendError::NoMatches);
    }

    let result = match llm_pick::pick(intent_trimmed, &candidates, already_connected, provider)
        .await
    {
        Some(r) if !r.primary_stack.is_empty() => r,
        _ => llm_pick::fallback_from_candidates(
            &candidates,
            already_connected,
            FALLBACK_STACK_SIZE,
        ),
    };

    cache::insert(cache_key, result.clone());
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_intent_is_rejected() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let r = rt.block_on(recommend("   ", &[], Provider::Anthropic));
        assert!(matches!(r, Err(RecommendError::EmptyIntent)));
    }
}
