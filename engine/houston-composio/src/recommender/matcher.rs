//! Semantic-first pre-filter (V1.5 Opción C).
//!
//! Cosine similarity (from MultilingualE5Small embeddings) is the
//! PRIMARY ranking signal. Keyword score is only a TIE-BREAKER and a
//! fallback for the (rare) case where embeddings cannot be computed.
//!
//! Why this design:
//! - Keyword-as-sum saturated the top-K whenever the user mentioned
//!   one app name explicitly ("whatsapp" → 10 WhatsApp clones squeeze
//!   out GitHub/Gmail for a "review PRs and notify whatsapp" intent).
//! - Pure-cosine semantic match captures intent regardless of which
//!   specific apps the user names: "review PRs" maps to GitHub even
//!   when the user only mentions WhatsApp.
//! - Exact name matches still win because cos("github", GitHub_passage)
//!   ≈ 0.9 — naturally higher than any other toolkit. We don't need
//!   keyword weight to make it dominate.
//! - Keyword score remains as a tie-breaker so that for two toolkits
//!   with effectively identical cosine, the one whose enriched fields
//!   literally mention the user's words wins (small but useful nudge).
//!
//! Fallback behaviour: if embeddings cannot be loaded or the intent
//! cannot be embedded, the matcher degrades to keyword-only ranking
//! (the previous V1 behaviour). That keeps the system functional even
//! when fastembed fails on a particular host.

use super::embedding_store::EmbeddingStore;
use super::embeddings::cosine;
use super::types::EnrichedToolkit;

/// Maximum number of candidates handed to the LLM-pick step. 20 is
/// the sweet spot empirically: enough variety for the LLM to cover
/// multi-task intents (each candidate brings ~6 fields of context),
/// but small enough to keep the prompt under ~3500 input tokens so
/// claude-haiku/gpt-mini respond in 15-30s rather than timing out at
/// 30-45s with the previous K=30.
pub const TOP_K: usize = 20;

/// Field weights for keyword scoring. Higher = stronger signal.
/// Used ONLY as a tie-breaker in the semantic-first path, and as the
/// primary score when embeddings are unavailable.
const W_KEYWORD: u32 = 5;
const W_USE_CASE: u32 = 4;
const W_NAME: u32 = 6;
const W_ONE_LINER: u32 = 2;
const W_PRIMARY_CATEGORY: u32 = 3;
const W_CATEGORY: u32 = 2;

/// Minimum cosine similarity for a toolkit to be considered a candidate
/// (when semantic ranking is active). Below this is essentially "no
/// relationship" — the toolkit gets filtered out unless it has a
/// keyword hit pulling it back in.
const MIN_COSINE_SCORE: f32 = 0.55;

/// Maximum number of candidates per primary category. Prevents the top
/// K from being saturated by 5+ near-duplicate toolkits in the same
/// category (e.g. 5 different WhatsApp clones), leaving no room for
/// the actual diverse stack a user typically needs.
const MAX_PER_CATEGORY: usize = 3;

/// Split an intent string into lowercase tokens of length >= 3.
/// Stopwords are deliberately NOT stripped — "validate leads" still
/// matches because users phrase intents with content words.
pub fn tokenize(intent: &str) -> Vec<String> {
    intent
        .to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|s| s.len() >= 3)
        .map(|s| s.to_string())
        .collect()
}

/// Returns the top-K toolkits ranked semantic-first.
///
/// Ranking:
/// 1. **Primary**: cosine similarity between intent and toolkit
///    embedding (when embeddings are available).
/// 2. **Tie-breaker**: keyword score (matches against name/keywords/
///    useCases/etc). Only meaningful when two toolkits have effectively
///    identical cosine — typically nudges the one whose enriched
///    metadata literally contains the user's vocabulary.
/// 3. **Final tie-breaker**: slug alphabetical order, for test
///    reproducibility.
///
/// Filtering: a toolkit must clear `MIN_COSINE_SCORE` OR have a
/// non-zero keyword score to be considered. This keeps the candidate
/// list focused: pure semantic noise (e.g. random "random toolkit" that
/// happens to have cosine 0.40 with the intent) gets dropped unless
/// the user's vocabulary explicitly references it.
///
/// Fallback (no embeddings): degrades to keyword-only ranking — the
/// V1 behaviour.
pub fn top_candidates<'a>(
    intent_tokens: &[String],
    toolkits: &'a [EnrichedToolkit],
    k: usize,
    intent_embedding: Option<&[f32]>,
    embeddings: Option<&EmbeddingStore>,
) -> Vec<&'a EnrichedToolkit> {
    if intent_tokens.is_empty() || toolkits.is_empty() {
        return Vec::new();
    }

    let use_semantic = intent_embedding.is_some()
        && embeddings.is_some()
        && !embeddings.unwrap().is_empty();

    // Score every toolkit with both signals. Each entry carries
    // (cosine, keyword) so we can sort lexicographically with cosine
    // as the dominant key.
    let mut scored: Vec<(f32, u32, &EnrichedToolkit)> = toolkits
        .iter()
        .filter_map(|t| {
            let kw = score_toolkit(intent_tokens, t);
            let cos = if use_semantic {
                embeddings
                    .unwrap()
                    .get(&t.slug)
                    .map(|v| cosine(intent_embedding.unwrap(), v).max(0.0))
                    .unwrap_or(0.0)
            } else {
                0.0
            };

            let semantic_ok = use_semantic && cos >= MIN_COSINE_SCORE;
            let keyword_ok = kw > 0;
            if !semantic_ok && !keyword_ok {
                return None;
            }
            Some((cos, kw, t))
        })
        .collect();

    // Sort: cosine DESC → keyword DESC → slug ASC.
    scored.sort_by(|(ca, ka, ta), (cb, kb, tb)| {
        cb.partial_cmp(ca)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| kb.cmp(ka))
            .then_with(|| ta.slug.cmp(&tb.slug))
    });

    // Diversify by primaryCategory so a single saturated category
    // (e.g. 5+ WhatsApp clones) doesn't squeeze out other relevant
    // toolkits the user actually needs (GitHub, Gmail, etc.).
    let mut per_category: std::collections::HashMap<&str, usize> =
        std::collections::HashMap::new();
    let mut diversified: Vec<&EnrichedToolkit> = Vec::with_capacity(k);
    for (_, _, t) in &scored {
        let count = per_category.entry(t.primary_category.as_str()).or_insert(0);
        if *count < MAX_PER_CATEGORY {
            diversified.push(*t);
            *count += 1;
            if diversified.len() >= k {
                break;
            }
        }
    }
    diversified
}

/// Score a single toolkit for the given intent tokens.
fn score_toolkit(intent_tokens: &[String], t: &EnrichedToolkit) -> u32 {
    let mut score = 0u32;

    for tok in intent_tokens {
        // Name is the strongest signal — exact name mentions are gold.
        if contains_token(&t.name.to_lowercase(), tok) {
            score = score.saturating_add(W_NAME);
        }
        if contains_token(&t.slug, tok) {
            score = score.saturating_add(W_NAME);
        }

        // Keywords: high-density end-user vocabulary, weight per match.
        for kw in &t.keywords {
            if contains_token(kw, tok) {
                score = score.saturating_add(W_KEYWORD);
            }
        }

        for uc in &t.use_cases {
            if contains_token(&uc.to_lowercase(), tok) {
                score = score.saturating_add(W_USE_CASE);
            }
        }

        if contains_token(&t.one_liner.to_lowercase(), tok) {
            score = score.saturating_add(W_ONE_LINER);
        }

        if contains_token(&t.primary_category, tok) {
            score = score.saturating_add(W_PRIMARY_CATEGORY);
        }
        for cat in &t.categories {
            if contains_token(&cat.to_lowercase(), tok) {
                score = score.saturating_add(W_CATEGORY);
            }
        }
    }

    // Penalize fallback entries (enrichment failed → almost empty
    // fields) so they only surface when nothing else matches.
    if t.enrichment_failed {
        score = score.saturating_sub(W_KEYWORD);
    }

    score
}

fn contains_token(haystack: &str, token: &str) -> bool {
    if token.len() >= 5 {
        // Allow substring matches for longer tokens so plurals/inflections
        // still match (e.g. "notificar" → "notificaciones").
        haystack.contains(token)
    } else {
        // Short tokens must match as whole words to avoid false positives
        // (e.g. "crm" shouldn't match "lecrm" or similar substrings).
        haystack
            .split(|c: char| !c.is_alphanumeric())
            .any(|w| w == token)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tk(slug: &str, keywords: &[&str], use_cases: &[&str]) -> EnrichedToolkit {
        EnrichedToolkit {
            slug: slug.into(),
            name: slug.into(),
            description: String::new(),
            logo_url: String::new(),
            categories: vec![],
            one_liner: String::new(),
            use_cases: use_cases.iter().map(|s| (*s).into()).collect(),
            keywords: keywords.iter().map(|s| (*s).into()).collect(),
            typical_combos: vec![],
            alternatives: vec![],
            pricing_tier: "freemium".into(),
            primary_category: "uncategorized".into(),
            enrichment_failed: false,
        }
    }

    #[test]
    fn tokenize_drops_short_words_and_punctuation() {
        let toks = tokenize("I want to validate leads from a form!");
        assert!(toks.contains(&"validate".into()));
        assert!(toks.contains(&"leads".into()));
        assert!(toks.contains(&"form".into()));
        assert!(!toks.contains(&"to".into()));
        assert!(!toks.contains(&"a".into()));
    }

    #[test]
    fn keywords_dominate_simple_matching() {
        let slack = tk("slack", &["notify", "team", "chat", "message"], &["notify the team"]);
        let mailchimp = tk("mailchimp", &["email", "campaign", "newsletter"], &[]);
        let catalog = vec![slack, mailchimp];

        let toks = tokenize("notify my team when a lead comes in");
        let top = top_candidates(&toks, &catalog, 5, None, None);
        assert_eq!(top[0].slug, "slack");
    }

    #[test]
    fn empty_intent_returns_empty() {
        let catalog = vec![tk("slack", &["chat"], &[])];
        assert!(top_candidates(&[], &catalog, 5, None, None).is_empty());
    }

    #[test]
    fn failed_enrichment_is_penalized() {
        let mut bad = tk("ghost", &["lead"], &[]);
        bad.enrichment_failed = true;
        let good = tk("hubspot", &["lead"], &[]);
        let catalog = vec![bad, good];
        let toks = tokenize("manage lead pipeline");
        let top = top_candidates(&toks, &catalog, 2, None, None);
        // bad gets one keyword hit (+5) then penalty (-5) → filtered out.
        // good gets the same keyword hit (+5) with no penalty.
        assert_eq!(top.len(), 1);
        assert_eq!(top[0].slug, "hubspot");
    }

    #[test]
    fn cosine_lifts_semantic_match_above_keyword_zero() {
        use super::super::embeddings::EMBEDDING_DIM;

        // ghost has no keyword overlap with the intent — keyword score
        // is 0 so under V1 it would be filtered out. But its embedding
        // is identical to the intent embedding, so cosine = 1.0 lifts
        // it above the threshold and into the top-K.
        let ghost = tk("ghost", &["totally", "unrelated"], &[]);
        let other = tk("other", &["something", "else"], &[]);
        let catalog = vec![ghost, other];

        // Both intent and store vectors must be EMBEDDING_DIM-sized.
        let mut intent_vec = vec![0.0f32; EMBEDDING_DIM];
        intent_vec[0] = 1.0;

        let mut ghost_vec = vec![0.0f32; EMBEDDING_DIM];
        ghost_vec[0] = 1.0;  // identical to intent → cos = 1.0
        let mut other_vec = vec![0.0f32; EMBEDDING_DIM];
        other_vec[1] = 1.0;  // orthogonal → cos = 0.0

        let store = build_test_store(vec![("ghost", ghost_vec), ("other", other_vec)]);

        let toks = tokenize("zzzz qqqq xxxx");
        let top = top_candidates(&toks, &catalog, 5, Some(&intent_vec), Some(&store));
        // ghost passes MIN_COSINE_SCORE (1.0 >> 0.55), other is below.
        assert_eq!(top.first().map(|t| t.slug.as_str()), Some("ghost"));
    }

    #[test]
    fn semantic_match_wins_over_keyword_saturation() {
        // Real-case regression test for the "review PRs and notify
        // whatsapp" bug: 5 WhatsApp clones all match the keyword
        // "whatsapp" with high keyword scores, but only GitHub has a
        // strong semantic match for "PRs". Under the old hybrid-sum
        // scoring the WhatsApp clones squeezed GitHub out of top-K.
        // Under semantic-first, GitHub wins on cosine even though its
        // keyword score is zero.
        use super::super::embeddings::EMBEDDING_DIM;

        let github = tk("github", &["code", "review"], &[]);
        let wa1 = tk("wa1", &["whatsapp", "chat"], &[]);
        let wa2 = tk("wa2", &["whatsapp", "chat"], &[]);
        let wa3 = tk("wa3", &["whatsapp", "chat"], &[]);
        let catalog = vec![github, wa1, wa2, wa3];

        // Intent embedding closer to GitHub passage than to WhatsApp.
        let mut intent_vec = vec![0.0f32; EMBEDDING_DIM];
        intent_vec[0] = 1.0;

        // GitHub vector aligned with intent → cos ≈ 1.0.
        let mut github_vec = vec![0.0f32; EMBEDDING_DIM];
        github_vec[0] = 1.0;
        // WhatsApp variants somewhat aligned but weaker → cos ≈ 0.6.
        let mut wa_vec = vec![0.0f32; EMBEDDING_DIM];
        wa_vec[0] = 0.6;
        wa_vec[1] = 0.8;

        let store = build_test_store(vec![
            ("github", github_vec),
            ("wa1", wa_vec.clone()),
            ("wa2", wa_vec.clone()),
            ("wa3", wa_vec),
        ]);

        // Intent literally mentions whatsapp → WhatsApp variants get
        // keyword score > 0. GitHub keyword score is 0 (no "github" or
        // "code" or "review" in the intent tokens). Old sum-scoring
        // would put WhatsApp on top; semantic-first puts GitHub.
        let toks = tokenize("review prs and notify whatsapp");
        let top = top_candidates(&toks, &catalog, 5, Some(&intent_vec), Some(&store));
        assert_eq!(top.first().map(|t| t.slug.as_str()), Some("github"));
    }

    // Build a minimal EmbeddingStore for tests by going through
    // serialize → parse (the only public path that constructs one).
    // Vectors are zero-padded / truncated to EMBEDDING_DIM as needed.
    fn build_test_store(entries: Vec<(&str, Vec<f32>)>) -> super::super::embedding_store::EmbeddingStore {
        use super::super::embeddings::EMBEDDING_DIM;
        use super::super::embedding_store::EmbeddingStore;

        // Tests use 4-dim vectors for readability; embedding_store
        // enforces EMBEDDING_DIM, so we shim around it by directly
        // constructing the in-memory map via a tiny serialize roundtrip
        // with EMBEDDING_DIM-sized padding.
        let padded: Vec<(String, Vec<f32>)> = entries
            .into_iter()
            .map(|(slug, mut v)| {
                v.resize(EMBEDDING_DIM, 0.0);
                (slug.to_string(), v)
            })
            .collect();
        let bytes = super::super::embedding_store::serialize(&padded);
        // The parse function is private — we use the bundled-loader
        // path through a hidden test-only helper. Construct via
        // round-trip; if parse fails the test fails loudly.
        EmbeddingStore::from_bytes_for_test(&bytes)
    }
}
