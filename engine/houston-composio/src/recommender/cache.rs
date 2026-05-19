//! In-memory cache for recommendations.
//!
//! Keyed by `(intent_normalized, sorted_connected_slugs)`. TTL = 24h.
//! Bounded at 256 entries — when full, evicts the oldest. Cache lives
//! for the engine process lifetime; restarting clears it, which is
//! fine because the underlying catalog could have changed anyway.

use super::types::RecommendResult;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

const TTL: Duration = Duration::from_secs(24 * 60 * 60);
const MAX_ENTRIES: usize = 256;

type Key = u64;

struct Entry {
    inserted_at: Instant,
    value: RecommendResult,
}

static CACHE: Mutex<Option<HashMap<Key, Entry>>> = Mutex::new(None);

pub fn key(intent: &str, already_connected: &[String]) -> Key {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    intent.trim().to_lowercase().hash(&mut hasher);
    let mut sorted: Vec<String> = already_connected
        .iter()
        .map(|s| s.trim().to_lowercase())
        .collect();
    sorted.sort();
    for s in &sorted {
        s.hash(&mut hasher);
    }
    hasher.finish()
}

pub fn get(k: Key) -> Option<RecommendResult> {
    let mut guard = CACHE.lock().ok()?;
    let map = guard.get_or_insert_with(HashMap::new);
    let entry = map.get(&k)?;
    if entry.inserted_at.elapsed() > TTL {
        map.remove(&k);
        return None;
    }
    Some(entry.value.clone())
}

pub fn insert(k: Key, value: RecommendResult) {
    let Ok(mut guard) = CACHE.lock() else {
        return;
    };
    let map = guard.get_or_insert_with(HashMap::new);

    if map.len() >= MAX_ENTRIES {
        // Evict the oldest entry. O(n) but n <= 256 and inserts are
        // rare (~1 per user query, bounded by user typing speed).
        if let Some((&oldest, _)) = map
            .iter()
            .min_by_key(|(_, e)| e.inserted_at)
        {
            map.remove(&oldest);
        }
    }

    map.insert(
        k,
        Entry {
            inserted_at: Instant::now(),
            value,
        },
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn key_is_order_independent_for_connected_slugs() {
        let a = key("validate leads", &["hubspot".into(), "gmail".into()]);
        let b = key("validate leads", &["gmail".into(), "hubspot".into()]);
        assert_eq!(a, b);
    }

    #[test]
    fn key_is_case_insensitive() {
        let a = key("Validate Leads", &["HubSpot".into()]);
        let b = key("validate leads", &["hubspot".into()]);
        assert_eq!(a, b);
    }
}
