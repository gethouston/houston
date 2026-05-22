//! Fetch all available Composio apps via the REST API.
//!
//! Calls `GET /api/v3/toolkits` using the API key from `~/.composio/user_data.json`.
//! Returns name, slug, description, logo URL, and categories for each toolkit.

use serde::{Deserialize, Serialize};

use crate::toolkits::normalize_toolkit_slug;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComposioAppEntry {
    pub toolkit: String,
    pub name: String,
    pub description: String,
    pub logo_url: String,
    pub categories: Vec<String>,
}

static CATALOG: tokio::sync::Mutex<Option<Vec<ComposioAppEntry>>> =
    tokio::sync::Mutex::const_new(None);

/// Returns the cached catalog, fetching from the API on first call.
/// Retries on next call if the previous attempt failed.
pub async fn list_all_apps() -> Vec<ComposioAppEntry> {
    {
        let guard = CATALOG.lock().await;
        if let Some(cached) = guard.as_ref() {
            if !cached.is_empty() {
                return cached.clone();
            }
        }
    }

    let apps = match fetch_from_api().await {
        Ok(apps) if !apps.is_empty() => {
            tracing::info!("[composio] Fetched {} apps from API", apps.len());
            apps
        }
        Ok(_) => {
            tracing::warn!("[composio] API returned empty app list");
            Vec::new()
        }
        Err(e) => {
            tracing::warn!("[composio] Failed to fetch apps: {e}");
            Vec::new()
        }
    };

    if !apps.is_empty() {
        *CATALOG.lock().await = Some(apps.clone());
    }
    apps
}

/// Read the user's API key, base URL, and org ID from `~/.composio/user_data.json`.
pub fn read_user_config_full() -> Result<(String, String, String), String> {
    let home = crate::install::home_dir();
    if home.as_os_str().is_empty() {
        return Err("could not resolve user home directory".to_string());
    }
    let path = home.join(".composio").join("user_data.json");
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Cannot read {}: {e}", path.display()))?;

    #[derive(Deserialize)]
    struct UserData {
        api_key: String,
        #[serde(default = "default_base_url")]
        base_url: String,
        #[serde(default)]
        org_id: String,
    }

    fn default_base_url() -> String {
        "https://backend.composio.dev".into()
    }

    let data: UserData =
        serde_json::from_str(&content).map_err(|e| format!("Invalid user_data.json: {e}"))?;

    if data.api_key.is_empty() {
        return Err("API key is empty in user_data.json".into());
    }
    Ok((data.api_key, data.base_url, data.org_id))
}

fn read_user_config() -> Result<(String, String), String> {
    let (api_key, base_url, _) = read_user_config_full()?;
    Ok((api_key, base_url))
}

async fn fetch_from_api() -> Result<Vec<ComposioAppEntry>, String> {
    let (api_key, base_url) = read_user_config()?;

    let client = reqwest::Client::new();
    let resp = client
        .get(format!("{base_url}/api/v3/toolkits"))
        .query(&[("limit", "1000")])
        .header("x-user-api-key", &api_key)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("API request failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("API returned status {}", resp.status()));
    }

    let body: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse API response: {e}"))?;

    parse_toolkits(&body)
}

fn parse_toolkits(body: &serde_json::Value) -> Result<Vec<ComposioAppEntry>, String> {
    let items = body
        .get("items")
        .and_then(|v| v.as_array())
        .ok_or("Expected 'items' array in API response")?;

    let mut apps = Vec::with_capacity(items.len());
    for item in items {
        let slug = normalize_toolkit_slug(
            item.get("slug")
                .and_then(|v| v.as_str())
                .unwrap_or_default(),
        );
        if slug.is_empty() {
            continue;
        }

        let name = item
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or(&slug)
            .to_string();

        let meta = item.get("meta");

        let description = meta
            .and_then(|m| m.get("description"))
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();

        let logo_url = meta
            .and_then(|m| m.get("logo"))
            .and_then(|v| v.as_str())
            .map(String::from)
            .unwrap_or_else(|| format!("https://logos.composio.dev/api/{slug}"));

        let categories = meta
            .and_then(|m| m.get("categories"))
            .and_then(|v| v.as_array())
            .map(|cats| {
                cats.iter()
                    .filter_map(|c| c.get("name").and_then(|n| n.as_str()).map(String::from))
                    .collect()
            })
            .unwrap_or_default();

        apps.push(ComposioAppEntry {
            toolkit: slug,
            name,
            description,
            logo_url,
            categories,
        });
    }
    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(apps)
}
