//! Keyword + category pre-filter.
//!
//! V1 strategy (no embeddings, no vector DB): tokenize the user intent,
//! score every toolkit by counting matches against its enriched fields
//! with field-specific weights, and keep the top K. The result is then
//! handed to the LLM-pick step to choose the final stack.
//!
//! Weights are tuned for the catalog enrichment shape — keywords and
//! useCases are deliberately the noisiest match because that's where
//! end-user vocabulary lives (e.g. "notificar al equipo" matches Slack's
//! `keywords: ["notificar","equipo",…]` even though Slack's official
//! description never mentions either word).

use super::types::EnrichedToolkit;

/// Maximum number of candidates handed to the LLM-pick step.
pub const TOP_K: usize = 30;

/// Field weights. Higher = stronger signal that this toolkit matches.
const W_KEYWORD: u32 = 5;
const W_USE_CASE: u32 = 4;
const W_NAME: u32 = 6;
const W_ONE_LINER: u32 = 2;
const W_PRIMARY_CATEGORY: u32 = 3;
const W_CATEGORY: u32 = 2;

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

/// Returns the top-K toolkits ranked by keyword match score, excluding
/// any that scored zero. The result is stable: ties broken by slug
/// alphabetical order so behavior is reproducible in tests.
pub fn top_candidates<'a>(
    intent_tokens: &[String],
    toolkits: &'a [EnrichedToolkit],
    k: usize,
) -> Vec<&'a EnrichedToolkit> {
    if intent_tokens.is_empty() || toolkits.is_empty() {
        return Vec::new();
    }

    let mut scored: Vec<(u32, &EnrichedToolkit)> = toolkits
        .iter()
        .map(|t| (score_toolkit(intent_tokens, t), t))
        .filter(|(s, _)| *s > 0)
        .collect();

    scored.sort_by(|(sa, ta), (sb, tb)| sb.cmp(sa).then_with(|| ta.slug.cmp(&tb.slug)));
    scored.into_iter().take(k).map(|(_, t)| t).collect()
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
        let top = top_candidates(&toks, &catalog, 5);
        assert_eq!(top[0].slug, "slack");
    }

    #[test]
    fn empty_intent_returns_empty() {
        let catalog = vec![tk("slack", &["chat"], &[])];
        assert!(top_candidates(&[], &catalog, 5).is_empty());
    }

    #[test]
    fn failed_enrichment_is_penalized() {
        let mut bad = tk("ghost", &["lead"], &[]);
        bad.enrichment_failed = true;
        let good = tk("hubspot", &["lead"], &[]);
        let catalog = vec![bad, good];
        let toks = tokenize("manage lead pipeline");
        let top = top_candidates(&toks, &catalog, 2);
        // bad gets one keyword hit (+5) then penalty (-5) → filtered out.
        // good gets the same keyword hit (+5) with no penalty.
        assert_eq!(top.len(), 1);
        assert_eq!(top[0].slug, "hubspot");
    }
}
