//! Stack recommender — reasoning-first (V1.6).
//!
//! Public entry point: [`recommend`]. Given a plain-language user intent
//! and the list of toolkit slugs the user has already connected, return
//! a curated stack of 2-6 Composio toolkits with role/reason text for
//! each. End users never need to browse the 1000-toolkit catalog.
//!
//! Pipeline (reasoning-first):
//!   1. LLM call ([`llm_pick::decompose_and_pick`]) decomposes the
//!      intent into sub-tasks and suggests concrete app slugs for each,
//!      using the LLM's own world knowledge.
//!   2. For each sub-task, walk the suggestedSlugs in priority order
//!      and pick the first one that exists in the bundled catalog.
//!      `catalog::find` accepts separator variants (`hacker-news` →
//!      `hackernews`) so the LLM doesn't need to know our exact slug
//!      shape.
//!   3. If none of the suggested slugs exist after normalization, fall
//!      back to embedding similarity search at a high cosine threshold
//!      (0.65). When nothing clears the threshold, the sub-task is
//!      reported in `missingCapabilities` instead of degrading to a
//!      weak match.
//!   4. Build the final stack with logos, connected flags, etc.
//!
//! Why this design beats the previous retrieval-first approach:
//! - The LLM knows that "review my code" needs GitHub and "research
//!   new tools" needs Firecrawl/Tavily, even when those words don't
//!   cosine-match the user's intent.
//! - Embedding retrieval becomes the fallback, not the primary signal.
//! - Sub-task decomposition is explicit, so multi-objective intents
//!   ("do X AND Y AND Z") get every objective covered.
//!
//! Failure modes (in order of precedence):
//! - LLM call fails (timeout, CLI missing, parse error) →
//!   transparent retrieval-first fallback ([`llm_pick::pick`] +
//!   [`llm_pick::fallback_from_candidates`]).
//! - Suggested slugs don't exist AND nothing clears the embedding
//!   threshold → reported in `missingCapabilities`.
//!
//! Results are cached in-memory for 24h keyed by `(intent_normalized,
//! sorted_connected_slugs)`.

mod banlist;
mod cache;
mod catalog;
pub mod embedding_store;
pub mod embeddings;
mod llm_pick;
mod matcher;
mod types;

use banlist::is_banned_app;

pub use types::{EnrichedToolkit, RecommendDebug, RecommendResult, StackEntry};

use embedding_store::EmbeddingStore;
use houston_terminal_manager::Provider;
use std::collections::HashSet;
use std::sync::OnceLock;

/// Maximum entries in the final returned stack when the LLM cannot run
/// at all and we have to fall back to pure top-K-by-similarity.
const FALLBACK_STACK_SIZE: usize = 5;

/// Bundled embeddings, parsed lazily on first use. If the bundled
/// `catalog-embeddings.bin` is missing or malformed (e.g. dev didn't
/// run the precompute binary yet), this resolves to an empty store.
/// In that case the V1.6 path still works for any suggested slug that
/// exists in the catalog; only the hallucination-fallback degrades.
static EMBEDDINGS: OnceLock<EmbeddingStore> = OnceLock::new();

fn embeddings() -> &'static EmbeddingStore {
    EMBEDDINGS.get_or_init(EmbeddingStore::from_bundled)
}

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
/// already authorized in Composio — used to populate the `connected`
/// flag on each stack entry and (via the prompt) to bias the LLM
/// toward reuse.
///
/// `provider` selects which CLI to call for the LLM step. Pass the
/// workspace's configured provider; the user has already logged into
/// that CLI via the normal Houston flow.
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

    let store = embeddings();
    let store_ref = if store.is_empty() { None } else { Some(store) };

    // Step 1 — LLM decomposes intent + suggests concrete app slugs.
    let decompose_outcome =
        llm_pick::decompose_and_pick(intent_trimmed, already_connected, provider).await;

    tracing::info!(
        provider = %provider,
        ms = decompose_outcome.elapsed_ms,
        subtask_count = decompose_outcome.subtasks.len(),
        error = ?decompose_outcome.error,
        "recommender: decompose returned"
    );

    // If decomposition failed entirely, fall back to retrieval-first.
    if decompose_outcome.subtasks.is_empty() {
        return retrieval_fallback(
            intent_trimmed,
            already_connected,
            provider,
            store_ref,
            cache_key,
            decompose_outcome.error,
        )
        .await;
    }

    // Step 2 — Resolve each sub-task to a concrete toolkit in the
    // catalog. Walk suggestedSlugs in priority order. If none exist,
    // embedding-search by sub-task description.
    let connected_set: HashSet<String> =
        already_connected.iter().map(|s| s.to_lowercase()).collect();
    let mut stack: Vec<StackEntry> = Vec::with_capacity(decompose_outcome.subtasks.len());
    let mut alternatives: std::collections::BTreeMap<String, Vec<String>> =
        std::collections::BTreeMap::new();
    let mut missing = decompose_outcome.missing_capabilities.clone();
    let mut used: HashSet<String> = HashSet::new();
    let mut fallback_embed_count = 0u32;

    for subtask in &decompose_outcome.subtasks {
        let mut picked: Option<&EnrichedToolkit> = None;
        let mut alts: Vec<String> = Vec::new();

        for slug in &subtask.suggested_slugs {
            let normalized = slug.trim().to_lowercase();
            if normalized.is_empty() || used.contains(&normalized) {
                continue;
            }
            if is_banned_app(&normalized) {
                continue;
            }
            if let Some(tk) = catalog::find(&normalized) {
                if picked.is_none() {
                    picked = Some(tk);
                } else {
                    alts.push(tk.slug.clone());
                }
            }
        }

        // None of the LLM's suggestions exist in the catalog (likely
        // hallucination). Try embedding-search by sub-task description
        // to find the semantically closest real toolkit.
        if picked.is_none() {
            if let Some(tk) =
                find_by_embedding_for_subtask(&subtask.description, store_ref, &used)
            {
                fallback_embed_count += 1;
                picked = Some(tk);
            }
        }

        match picked {
            Some(tk) => {
                used.insert(tk.slug.clone());
                if !alts.is_empty() {
                    alternatives.insert(tk.slug.clone(), alts);
                }
                stack.push(StackEntry {
                    toolkit: tk.slug.clone(),
                    name: tk.name.clone(),
                    role: pick_or_default(&subtask.role, &tk.primary_category),
                    reason: pick_or_default(&subtask.reason, &tk.one_liner),
                    connected: connected_set.contains(&tk.slug),
                    logo_url: tk.logo_url.clone(),
                });
            }
            None => {
                // Could not resolve this sub-task to any toolkit, even
                // by embedding. Surface it honestly.
                missing.push(format!(
                    "{} (no available integration covers this)",
                    subtask.description.trim()
                ));
            }
        }
    }

    let result = if stack.is_empty() {
        // Decompose succeeded structurally but zero sub-tasks resolved
        // to real toolkits. Fall back to retrieval.
        return retrieval_fallback(
            intent_trimmed,
            already_connected,
            provider,
            store_ref,
            cache_key,
            Some("decompose returned no resolvable slugs".into()),
        )
        .await;
    } else {
        RecommendResult {
            primary_stack: stack,
            alternatives,
            missing_capabilities: missing,
            llm_picked: true,
            debug: Some(types::RecommendDebug {
                catalog_size: catalog::toolkits().len(),
                embeddings_loaded: store.len(),
                intent_embedded: false,
                embed_ms: 0,
                top_candidate_slugs: decompose_outcome
                    .subtasks
                    .iter()
                    .flat_map(|s| s.suggested_slugs.clone())
                    .collect(),
                llm_pick_ms: decompose_outcome.elapsed_ms,
                llm_pick_error: decompose_outcome.error,
            }),
        }
    };

    if fallback_embed_count > 0 {
        tracing::info!(
            fallback_embed_count,
            "recommender: some sub-tasks resolved via embedding fallback (LLM hallucinated those slugs)"
        );
    }

    cache::insert(cache_key, result.clone());
    Ok(result)
}

/// Minimum cosine the embedding fallback must reach before accepting a
/// match. Set deliberately high: this path only fires when the LLM
/// suggested a slug that doesn't exist in our catalog, so we'd rather
/// surface a `missingCapability` than degrade to a tangentially related
/// match. Tuned after observing `hunter` (email finder, ~0.50 cosine
/// against a "product discovery" sub-task description) get selected for
/// a "discover new dev tools" intent — the kind of failure that erodes
/// user trust in the recommender.
const EMBEDDING_FALLBACK_MIN_COSINE: f32 = 0.65;

/// Embedding-similarity search restricted to a sub-task description.
/// Used only when the LLM suggested slugs that don't exist in the
/// catalog. We embed the description and walk the bundled vectors
/// for the closest match, skipping toolkits we've already used and
/// banned orchestrators.
///
/// Returns `None` when nothing clears the threshold — the caller will
/// surface a `missingCapability` rather than degrade the stack with a
/// weak semantic match.
fn find_by_embedding_for_subtask<'a>(
    description: &str,
    store: Option<&'a EmbeddingStore>,
    used: &HashSet<String>,
) -> Option<&'static EnrichedToolkit> {
    let store = store?;
    let query_vec = embeddings::embed_query(description.trim()).ok()?;

    let mut best: Option<(f32, &'static EnrichedToolkit)> = None;
    for toolkit in catalog::toolkits() {
        if used.contains(&toolkit.slug) || is_banned_app(&toolkit.slug) {
            continue;
        }
        let Some(vec) = store.get(&toolkit.slug) else {
            continue;
        };
        let cos = embeddings::cosine(&query_vec, vec);
        if cos < EMBEDDING_FALLBACK_MIN_COSINE {
            continue;
        }
        match best {
            Some((b, _)) if cos <= b => {}
            _ => best = Some((cos, toolkit)),
        }
    }
    if let Some((score, tk)) = best {
        tracing::info!(
            slug = %tk.slug,
            cosine = score,
            "recommender: embedding fallback selected toolkit"
        );
    } else {
        tracing::info!(
            description = %description.trim(),
            min = EMBEDDING_FALLBACK_MIN_COSINE,
            "recommender: embedding fallback found nothing above threshold"
        );
    }
    best.map(|(_, t)| t)
}

/// Last-resort fallback: when reasoning-first fails completely, use
/// the V1.5 retrieval-first pipeline as a safety net. Returns a
/// degraded result so the UX still shows something useful.
async fn retrieval_fallback(
    intent: &str,
    already_connected: &[String],
    provider: Provider,
    store_ref: Option<&'static EmbeddingStore>,
    cache_key: u64,
    decompose_error: Option<String>,
) -> Result<RecommendResult, RecommendError> {
    let tokens = matcher::tokenize(intent);
    let embed_start = std::time::Instant::now();
    let intent_vec = embeddings::embed_query(intent).ok();
    let candidates = matcher::top_candidates(
        &tokens,
        catalog::toolkits(),
        matcher::TOP_K,
        intent_vec.as_deref(),
        store_ref,
    );

    if candidates.is_empty() {
        return Err(RecommendError::NoMatches);
    }

    let candidate_slugs: Vec<String> =
        candidates.iter().map(|t| t.slug.clone()).collect();

    let pick_outcome =
        llm_pick::pick(intent, &candidates, already_connected, provider).await;

    let mut result = match pick_outcome.result.as_ref() {
        Some(r) if !r.primary_stack.is_empty() => r.clone(),
        _ => llm_pick::fallback_from_candidates(
            &candidates,
            already_connected,
            FALLBACK_STACK_SIZE,
        ),
    };

    let combined_error = match (decompose_error, pick_outcome.error) {
        (Some(d), Some(p)) => Some(format!("decompose: {d}; retrieval pick: {p}")),
        (Some(d), None) => Some(format!("decompose: {d}")),
        (None, Some(p)) => Some(p),
        (None, None) => None,
    };

    result.debug = Some(types::RecommendDebug {
        catalog_size: catalog::toolkits().len(),
        embeddings_loaded: store_ref.map(|s| s.len()).unwrap_or(0),
        intent_embedded: intent_vec.is_some(),
        embed_ms: embed_start.elapsed().as_millis() as u64,
        top_candidate_slugs: candidate_slugs,
        llm_pick_ms: pick_outcome.elapsed_ms,
        llm_pick_error: combined_error,
    });

    cache::insert(cache_key, result.clone());
    Ok(result)
}

fn pick_or_default(picked: &str, fallback: &str) -> String {
    if picked.trim().is_empty() {
        fallback.to_string()
    } else {
        picked.trim().to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_intent_is_rejected() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let r = rt.block_on(recommend("   ", &[], Provider::default()));
        assert!(matches!(r, Err(RecommendError::EmptyIntent)));
    }

}
