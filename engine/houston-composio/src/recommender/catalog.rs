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
pub fn find(slug: &str) -> Option<&'static EnrichedToolkit> {
    let needle = slug.trim().to_lowercase();
    toolkits().iter().find(|t| t.slug == needle)
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
}
