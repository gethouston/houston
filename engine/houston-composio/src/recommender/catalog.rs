//! Static catalog loader.
//!
//! The enriched catalog is generated offline by
//! `scripts/enrich-composio-catalog.mjs` and committed to
//! `engine/houston-composio/data/catalog-enriched.json`. We embed it
//! into the engine binary via `include_str!` so end users never hit the
//! network or carry a stale catalog out-of-sync with the binary.

use super::types::{EnrichedCatalog, EnrichedToolkit};
use std::sync::OnceLock;

const RAW_CATALOG: &str = include_str!("../../data/catalog-enriched.json");

static CATALOG: OnceLock<EnrichedCatalog> = OnceLock::new();

/// Returns the parsed enriched catalog. Panics only if the bundled JSON
/// fails to parse — that's a build-time invariant violation, not a
/// runtime failure mode (CI rejects malformed catalog files).
pub fn catalog() -> &'static EnrichedCatalog {
    CATALOG.get_or_init(|| match serde_json::from_str::<EnrichedCatalog>(RAW_CATALOG) {
        Ok(c) => c,
        Err(e) => {
            // We cannot tracing::error! here because OnceLock may run
            // before logging is initialized; panic carries the most
            // diagnostic context.
            panic!("invalid bundled catalog-enriched.json: {e}");
        }
    })
}

/// All toolkits in the enriched catalog.
pub fn toolkits() -> &'static [EnrichedToolkit] {
    &catalog().toolkits
}

/// True when the catalog is empty (e.g. the script has never been run
/// in a fresh checkout). Callers can use this to short-circuit with a
/// clear error instead of returning an empty stack silently.
pub fn is_empty() -> bool {
    catalog().toolkits.is_empty()
}

/// Look up a toolkit by slug. O(n) — fine for the recommender's hot
/// path because we only resolve the ~10 winners.
///
/// Tries an exact lowercase match first, then a separator-insensitive
/// match: `hacker-news` resolves to `hackernews`, `google_calendar` to
/// `googlecalendar`. The LLM doesn't know our exact slug shapes, so we
/// accept the obvious variants instead of falling through to embedding
/// fallback for what is really a spelling difference.
pub fn find(slug: &str) -> Option<&'static EnrichedToolkit> {
    let needle = slug.trim().to_lowercase();
    if let Some(hit) = toolkits().iter().find(|t| t.slug == needle) {
        return Some(hit);
    }
    let stripped = strip_separators(&needle);
    if stripped.is_empty() {
        return None;
    }
    toolkits()
        .iter()
        .find(|t| strip_separators(&t.slug) == stripped)
}

fn strip_separators(s: &str) -> String {
    s.chars()
        .filter(|c| !matches!(c, '-' | '_' | '.' | ' '))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_catalog_parses() {
        // Just touching `catalog()` is enough — it parses on first call
        // and panics on failure. This test guards against malformed
        // commits.
        let _ = catalog();
    }

    #[test]
    fn find_accepts_separator_variants() {
        // The catalog uses `hackernews` (no separator). The LLM often
        // emits `hacker-news` or `hacker_news` from world knowledge. We
        // must resolve those without falling through to embeddings.
        assert!(find("hackernews").is_some());
        assert_eq!(find("hacker-news").map(|t| t.slug.as_str()), Some("hackernews"));
        assert_eq!(find("hacker_news").map(|t| t.slug.as_str()), Some("hackernews"));
    }

    #[test]
    fn find_returns_none_for_unknown() {
        // ProductHunt is genuinely not in the Composio catalog — must
        // resolve to None so the caller can flag a missingCapability
        // instead of dropping to a bad embedding match.
        assert!(find("producthunt").is_none());
        assert!(find("product-hunt").is_none());
    }
}
