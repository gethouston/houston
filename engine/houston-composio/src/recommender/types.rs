//! Wire-level + internal types for the stack recommender.
//!
//! `EnrichedToolkit` is the row format produced by
//! `scripts/enrich-composio-catalog.mjs` and embedded in the engine
//! binary via `include_str!`. Everything else is consumed by the
//! recommender pipeline and by the wire protocol (the protocol DTOs in
//! `houston-engine-protocol` mirror these field names).

use serde::{Deserialize, Serialize};

/// One toolkit as it appears in the enriched catalog JSON.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnrichedToolkit {
    pub slug: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub logo_url: String,
    #[serde(default)]
    pub categories: Vec<String>,

    pub one_liner: String,
    #[serde(default)]
    pub use_cases: Vec<String>,
    #[serde(default)]
    pub keywords: Vec<String>,
    #[serde(default)]
    pub typical_combos: Vec<String>,
    #[serde(default)]
    pub alternatives: Vec<String>,
    #[serde(default = "default_tier")]
    pub pricing_tier: String,
    #[serde(default = "default_category")]
    pub primary_category: String,

    /// Set by the enrichment script when an LLM call ultimately failed
    /// for this toolkit. The fallback entry has empty `use_cases` /
    /// `keywords` so it scores poorly in the matcher but still appears.
    #[serde(default)]
    pub enrichment_failed: bool,
}

fn default_tier() -> String {
    "freemium".to_string()
}
fn default_category() -> String {
    "uncategorized".to_string()
}

/// Top-level shape of `data/catalog-enriched.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnrichedCatalog {
    #[serde(default)]
    pub version: u32,
    #[serde(default)]
    pub generated_at: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub toolkits: Vec<EnrichedToolkit>,
}

/// One slot in the recommended stack.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StackEntry {
    pub toolkit: String,
    pub name: String,
    /// Why this toolkit is here — the role it plays in the workflow.
    /// e.g. "lead capture", "CRM sink", "notification". Comes from the
    /// LLM pick step.
    pub role: String,
    /// One-sentence explanation tied to the user's intent.
    pub reason: String,
    pub connected: bool,
    pub logo_url: String,
}

/// Final response sent to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecommendResult {
    /// The recommended stack in order: primary first, then dependencies.
    pub primary_stack: Vec<StackEntry>,
    /// Map slug -> equivalent toolkit slugs the user could swap in.
    pub alternatives: std::collections::BTreeMap<String, Vec<String>>,
    /// Capabilities the user asked for that no toolkit in the catalog
    /// covers. Surfaces honestly so the LLM doesn't hallucinate.
    pub missing_capabilities: Vec<String>,
    /// True when the LLM pick step ran. False when the pipeline fell
    /// back to top-K-by-keyword-score because no CLI provider was
    /// available or the call timed out — frontends can show a softer
    /// confidence indicator in that case.
    pub llm_picked: bool,
}
