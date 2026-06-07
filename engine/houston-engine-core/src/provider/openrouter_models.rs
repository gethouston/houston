//! Fetch OpenRouter's public model catalog using the user's stored API key.

use super::openrouter_catalog_cache::get_openrouter_catalog;
use crate::error::CoreResult;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenRouterCatalogModel {
    pub id: String,
    pub name: String,
    pub description: String,
    pub is_free: bool,
}

#[derive(Debug, Deserialize)]
pub(crate) struct ModelsListResponse {
    pub(crate) data: Vec<RemoteModel>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct RemoteModel {
    pub(crate) id: String,
    pub(crate) name: String,
    #[serde(default)]
    pub(crate) description: String,
    pub(crate) pricing: RemotePricing,
}

#[derive(Debug, Deserialize)]
pub(crate) struct RemotePricing {
    #[serde(default)]
    pub(crate) prompt: String,
    #[serde(default)]
    pub(crate) completion: String,
}

pub(crate) fn map_remote_model(m: RemoteModel) -> OpenRouterCatalogModel {
    OpenRouterCatalogModel {
        id: m.id,
        name: m.name,
        description: m.description,
        is_free: is_free_pricing(&m.pricing.prompt, &m.pricing.completion),
    }
}

fn is_free_pricing(prompt: &str, completion: &str) -> bool {
    let parse = |s: &str| s.trim().parse::<f64>().unwrap_or(f64::NAN);
    let p = parse(prompt);
    let c = parse(completion);
    p == 0.0 && c == 0.0
}

fn filter_models(models: Vec<OpenRouterCatalogModel>, query: &str) -> Vec<OpenRouterCatalogModel> {
    let q = query.trim().to_lowercase();
    if q.is_empty() {
        return models;
    }
    models
        .into_iter()
        .filter(|m| {
            m.id.to_lowercase().contains(&q)
                || m.name.to_lowercase().contains(&q)
                || m.description.to_lowercase().contains(&q)
        })
        .collect()
}

pub async fn list_openrouter_models(query: Option<&str>) -> CoreResult<Vec<OpenRouterCatalogModel>> {
    let models = get_openrouter_catalog().await?;
    Ok(filter_models(models, query.unwrap_or_default()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_free_pricing_detects_zero_rates() {
        assert!(is_free_pricing("0", "0"));
        assert!(!is_free_pricing("0.000001", "0"));
        assert!(!is_free_pricing("0", "bad"));
    }

    #[test]
    fn filter_models_matches_id_name_and_description() {
        let models = vec![
            OpenRouterCatalogModel {
                id: "openai/gpt-4.1".into(),
                name: "GPT-4.1".into(),
                description: "Frontier".into(),
                is_free: false,
            },
            OpenRouterCatalogModel {
                id: "qwen/qwen3-coder:free".into(),
                name: "Qwen3 Coder".into(),
                description: "Free coding".into(),
                is_free: true,
            },
        ];
        let hits = filter_models(models, "qwen");
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].id, "qwen/qwen3-coder:free");
    }
}
