//! In-memory OpenRouter model catalog cache + shared HTTP client.

use super::openrouter_credentials::read_openrouter_api_key;
use super::openrouter_models::{map_remote_model, ModelsListResponse, OpenRouterCatalogModel, RemoteModel};
use crate::error::{CoreError, CoreResult};
use std::sync::OnceLock;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

pub(crate) const MODELS_URL: &str =
    "https://openrouter.ai/api/v1/models?output_modalities=text&supported_parameters=tools";

const CACHE_TTL: Duration = Duration::from_secs(3600);

#[derive(Clone)]
struct CachedCatalog {
    fetched_at: Instant,
    models: Vec<OpenRouterCatalogModel>,
}

static CATALOG: Mutex<Option<CachedCatalog>> = Mutex::const_new(None);

pub(crate) fn http_client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(reqwest::Client::new)
}

pub async fn invalidate_openrouter_catalog_cache() {
    *CATALOG.lock().await = None;
}

pub async fn get_openrouter_catalog() -> CoreResult<Vec<OpenRouterCatalogModel>> {
    {
        let guard = CATALOG.lock().await;
        if let Some(cached) = guard.as_ref() {
            if cached.fetched_at.elapsed() < CACHE_TTL {
                return Ok(cached.models.clone());
            }
        }
    }
    refresh_openrouter_catalog().await
}

async fn refresh_openrouter_catalog() -> CoreResult<Vec<OpenRouterCatalogModel>> {
    let models = fetch_models_from_api().await?;
    *CATALOG.lock().await = Some(CachedCatalog {
        fetched_at: Instant::now(),
        models: models.clone(),
    });
    Ok(models)
}

async fn fetch_models_from_api() -> CoreResult<Vec<OpenRouterCatalogModel>> {
    let key = read_openrouter_api_key()
        .await?
        .filter(|k| !k.trim().is_empty())
        .ok_or_else(|| {
            CoreError::BadRequest(
                "OpenRouter API key missing. Connect OpenRouter before listing models.".into(),
            )
        })?;

    let resp = http_client()
        .get(MODELS_URL)
        .header("Authorization", format!("Bearer {key}"))
        .send()
        .await
        .map_err(|e| CoreError::Internal(format!("OpenRouter models request failed: {e}")))?;

    let status = resp.status();
    let body = resp
        .text()
        .await
        .map_err(|e| CoreError::Internal(format!("OpenRouter models body read failed: {e}")))?;

    if status == reqwest::StatusCode::UNAUTHORIZED {
        return Err(CoreError::BadRequest(
            "OpenRouter rejected your API key. Check the key and try again.".into(),
        ));
    }
    if !status.is_success() {
        return Err(CoreError::Internal(format!(
            "OpenRouter models API returned HTTP {status}: {body}"
        )));
    }

    let parsed: ModelsListResponse = serde_json::from_str(&body).map_err(|e| {
        CoreError::Internal(format!("OpenRouter models JSON parse failed: {e}"))
    })?;

    let mut models: Vec<OpenRouterCatalogModel> = parsed
        .data
        .into_iter()
        .map(map_remote_model)
        .collect();
    models.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(models)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn invalidate_clears_cached_catalog() {
        *CATALOG.lock().await = Some(CachedCatalog {
            fetched_at: Instant::now(),
            models: vec![OpenRouterCatalogModel {
                id: "test/model".into(),
                name: "Test".into(),
                description: String::new(),
                is_free: false,
            }],
        });
        invalidate_openrouter_catalog_cache().await;
        assert!(CATALOG.lock().await.is_none());
    }

    #[test]
    fn cache_ttl_is_one_hour() {
        assert_eq!(CACHE_TTL, Duration::from_secs(3600));
    }

    #[test]
    fn remote_model_deserializes() {
        let raw = r#"{"id":"a/b","name":"B","description":"d","pricing":{"prompt":"0","completion":"0"}}"#;
        let m: RemoteModel = serde_json::from_str(raw).unwrap();
        assert_eq!(m.id, "a/b");
    }
}
