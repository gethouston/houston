//! Composio integration: fetch active OAuth connections via the Composio MCP server.
//!
//! Reads the MCP server URL from `~/.claude.json` and the OAuth token from the
//! macOS keychain. Calls the `COMPOSIO_MANAGE_CONNECTIONS` tool to list which
//! services (Gmail, GitHub, Slack, etc.) the user has connected.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::apps::ComposioAppEntry;

// -- Public types --

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComposioConnection {
    pub toolkit: String,
    pub display_name: String,
    pub description: String,
    pub email: Option<String>,
    pub logo_url: String,
    pub connected_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "status")]
pub enum ComposioResult {
    #[serde(rename = "not_configured")]
    NotConfigured,
    #[serde(rename = "needs_auth")]
    NeedsAuth,
    #[serde(rename = "error")]
    Error { message: String },
    #[serde(rename = "ok")]
    Ok {
        connections: Vec<ComposioConnection>,
    },
}

// -- Public API --

pub async fn list_active_connections() -> ComposioResult {
    let url = match read_composio_url() {
        Some(u) => u,
        None => return ComposioResult::NotConfigured,
    };

    // Get a valid token — refresh silently if expired
    let token = match get_valid_token().await {
        Some(t) => t,
        None => return ComposioResult::NeedsAuth,
    };

    let result = fetch_connections(&url, &token).await;

    // If fetch failed, try one refresh + retry before giving up
    if matches!(result, ComposioResult::Error { .. }) {
        tracing::warn!("[composio] Fetch failed, attempting token refresh and retry");
        if let Ok(new_token) = crate::auth::refresh_access_token().await {
            return fetch_connections(&url, &new_token).await;
        }
    }

    result
}

/// Initiate a connection to a Composio app. Returns the redirect URL for authentication.
pub async fn initiate_app_connection(toolkit: &str) -> Result<String, String> {
    let url = read_composio_url().ok_or("Composio not configured")?;
    let token = get_valid_token()
        .await
        .ok_or("Not authenticated with Composio")?;

    let text = call_mcp_tool(
        &url,
        &token,
        "COMPOSIO_MANAGE_CONNECTIONS",
        serde_json::json!({ "toolkits": [toolkit] }),
    )
    .await?;

    let parsed: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("Invalid JSON: {e}"))?;

    let tk_result = parsed
        .pointer(&format!("/data/results/{toolkit}"))
        .ok_or_else(|| format!("No result for toolkit '{toolkit}'"))?;

    if tk_result.get("status").and_then(|s| s.as_str()) == Some("active") {
        return Err("Already connected".to_string());
    }

    tk_result
        .get("redirect_url")
        .and_then(|u| u.as_str())
        .map(String::from)
        .ok_or_else(|| "No authentication URL available".to_string())
}

pub(crate) async fn get_valid_token() -> Option<String> {
    let (token, expired) = read_oauth_token_with_expiry();
    let token = token?;

    if !expired {
        return Some(token);
    }

    // Token expired — try silent refresh
    tracing::warn!("[composio] Token expired, attempting silent refresh");
    match crate::auth::refresh_access_token().await {
        Ok(new_token) => Some(new_token),
        Err(e) => {
            tracing::error!("[composio] Silent refresh failed: {e}");
            None
        }
    }
}

// -- Config: read Composio URL from ~/.claude.json --

pub(crate) fn read_composio_url() -> Option<String> {
    let home = crate::install::home_dir();
    if home.as_os_str().is_empty() {
        return None;
    }
    let path = home.join(".claude.json");
    let content = std::fs::read_to_string(&path).ok()?;
    let config: serde_json::Value = serde_json::from_str(&content).ok()?;
    let composio = config.pointer("/mcpServers/composio")?;
    composio
        .pointer("/url")
        .and_then(|u| u.as_str())
        .map(String::from)
}

// -- Auth: read OAuth token from macOS keychain --

/// Returns (token, is_expired). Token is None if no credentials exist.
fn read_oauth_token_with_expiry() -> (Option<String>, bool) {
    let whoami = match std::process::Command::new("whoami").output() {
        Ok(o) => o,
        Err(_) => return (None, false),
    };
    let username = String::from_utf8_lossy(&whoami.stdout).trim().to_string();

    let output = match std::process::Command::new("security")
        .args([
            "find-generic-password",
            "-s",
            "Claude Code-credentials",
            "-a",
            &username,
            "-w",
        ])
        .output()
    {
        Ok(o) if o.status.success() => o,
        _ => return (None, false),
    };

    let json_str = String::from_utf8_lossy(&output.stdout);
    let data: serde_json::Value = match serde_json::from_str(json_str.trim()) {
        Ok(d) => d,
        Err(_) => return (None, false),
    };
    let mcp_oauth = match data.get("mcpOAuth").and_then(|v| v.as_object()) {
        Some(o) => o,
        None => return (None, false),
    };

    // Multiple `composio|<hash>` entries can exist after re-auth. Pick the one with
    // the latest expiration — that's the most recent sign-in. Earlier logic returned
    // on the first entry encountered, which was often stale (empty token) and caused
    // the UI to stay stuck in `needs_auth` after the user re-signed in.
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let mut best: Option<(String, u64)> = None;
    for (key, info) in mcp_oauth {
        if !key.starts_with("composio") {
            continue;
        }
        let token = info
            .get("accessToken")
            .and_then(|t| t.as_str())
            .filter(|s| !s.is_empty());
        let Some(token) = token else { continue };

        let expires_at = info
            .get("expiresAt")
            .and_then(|e| e.as_u64())
            .unwrap_or(u64::MAX);

        // Prefer the entry with the latest expiration (newest sign-in).
        if best.as_ref().map_or(true, |(_, e)| expires_at > *e) {
            best = Some((token.to_string(), expires_at));
        }
    }

    match best {
        Some((token, expires_at)) => (Some(token), now >= expires_at),
        None => (None, false),
    }
}

// -- MCP JSON-RPC helper --

async fn call_mcp_tool(
    url: &str,
    token: &str,
    tool_name: &str,
    arguments: serde_json::Value,
) -> Result<String, String> {
    let mcp_request = serde_json::json!({
        "jsonrpc": "2.0", "id": 1,
        "method": "tools/call",
        "params": { "name": tool_name, "arguments": arguments }
    });

    let client = reqwest::Client::new();
    let response = client
        .post(url)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json, text/event-stream")
        .header("Authorization", format!("Bearer {token}"))
        .json(&mcp_request)
        .send()
        .await
        .map_err(|e| format!("Could not reach Composio: {e}"))?;

    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {e}"))?;

    let data_line = body
        .lines()
        .find(|l| l.starts_with("data: "))
        .ok_or_else(|| "No data in Composio response".to_string())?;

    let rpc: serde_json::Value =
        serde_json::from_str(&data_line[6..]).map_err(|e| format!("Invalid JSON: {e}"))?;

    rpc.pointer("/result/content/0/text")
        .and_then(|t| t.as_str())
        .map(String::from)
        .ok_or_else(|| "Missing content in response".to_string())
}

// -- Fetch connections --

async fn fetch_connections(url: &str, token: &str) -> ComposioResult {
    // Pass the full 982-app catalog to COMPOSIO_MANAGE_CONNECTIONS to discover
    // every active connection — including obscure toolkits the user has linked
    // outside of popular categories.
    //
    // Side effect: for each non-active toolkit we pass, Composio generates a
    // temporary (10-minute) auth `redirect_url` in the response. These are not
    // permanent — they expire quickly — so we just ignore the `initiated` entries
    // and only keep `active` ones. Heavy caching (prewarm on launch + TanStack
    // Query 1h staleTime) means this expensive call only runs once per session.
    let catalog = crate::apps::list_all_apps().await;
    // Fall back to a minimal list if the catalog fetch failed (network issue, etc.)
    // so the user still sees their most common connections instead of an error.
    let toolkits: Vec<String> = if catalog.is_empty() {
        tracing::warn!("[composio] Catalog empty, using fallback toolkit list");
        FALLBACK_TOOLKITS.iter().map(|s| s.to_string()).collect()
    } else {
        catalog.iter().map(|a| a.toolkit.clone()).collect()
    };

    let catalog_map: HashMap<String, ComposioAppEntry> = catalog
        .into_iter()
        .map(|a| (a.toolkit.clone(), a))
        .collect();

    let text = match call_mcp_tool(
        url,
        token,
        "COMPOSIO_MANAGE_CONNECTIONS",
        serde_json::json!({ "toolkits": toolkits }),
    )
    .await
    {
        Ok(t) => t,
        Err(e) => return ComposioResult::Error { message: e },
    };

    match parse_composio_json(&text, &catalog_map) {
        Ok(c) => ComposioResult::Ok { connections: c },
        Err(e) => ComposioResult::Error { message: e },
    }
}

// -- Parse the Composio response JSON --

fn parse_composio_json(
    text: &str,
    catalog: &HashMap<String, ComposioAppEntry>,
) -> Result<Vec<ComposioConnection>, String> {
    let parsed: serde_json::Value =
        serde_json::from_str(text).map_err(|e| format!("Invalid JSON: {e}"))?;
    let results = parsed
        .pointer("/data/results")
        .and_then(|r| r.as_object())
        .ok_or("Missing data.results")?;

    let mut connections = Vec::new();
    for (toolkit, info) in results {
        // Only keep active connections — skip `initiated` entries which are
        // just temporary auth links Composio created as a side effect.
        if info.get("status").and_then(|s| s.as_str()) != Some("active") {
            continue;
        }
        let email = info
            .get("current_user_info")
            .and_then(|u| {
                u.get("email")
                    .or_else(|| u.get("emailAddress"))
                    .and_then(|e| e.as_str())
            })
            .map(String::from);

        // Prefer catalog metadata (covers all 982 toolkits with real names/logos).
        // Fall back to hardcoded metadata for toolkits not in the catalog.
        let (display_name, logo, description) = if let Some(entry) = catalog.get(toolkit) {
            (
                entry.name.clone(),
                entry.logo_url.clone(),
                entry.description.clone(),
            )
        } else {
            let (name, icon_url, fallback_domain) = toolkit_meta(toolkit);
            let logo = if icon_url.is_empty() {
                format!("https://www.google.com/s2/favicons?domain={fallback_domain}&sz=128")
            } else {
                icon_url.to_string()
            };
            (name.to_string(), logo, short_description(toolkit))
        };

        connections.push(ComposioConnection {
            display_name,
            toolkit: toolkit.clone(),
            description,
            email,
            logo_url: logo,
            connected_at: info
                .get("created_at")
                .and_then(|c| c.as_str())
                .map(String::from),
        });
    }
    connections.sort_by(|a, b| a.display_name.cmp(&b.display_name));
    Ok(connections)
}

// -- Toolkit metadata --

/// Fallback list used only when the full 982-app catalog fetch fails.
/// Covers the most common user connections as a safety net.
const FALLBACK_TOOLKITS: &[&str] = &[
    "gmail",
    "googledrive",
    "googlecalendar",
    "googlesheets",
    "googledocs",
    "outlook",
    "microsoft_teams",
    "onedrive",
    "slack",
    "discord",
    "telegram",
    "linkedin",
    "twitter",
    "github",
    "gitlab",
    "notion",
    "airtable",
    "linear",
    "jira",
    "asana",
    "trello",
    "hubspot",
    "salesforce",
    "stripe",
    "shopify",
    "dropbox",
    "figma",
    "exa",
    "tavily",
    "firecrawl",
];

pub fn toolkit_display_name(slug: &str) -> &str {
    toolkit_meta(slug).0
}

fn toolkit_meta(tk: &str) -> (&str, &str, &str) {
    match tk {
        "gmail" => (
            "Gmail",
            "https://www.gstatic.com/images/branding/product/2x/gmail_2020q4_48dp.png",
            "gmail.com",
        ),
        "googledrive" => (
            "Google Drive",
            "https://www.gstatic.com/images/branding/product/2x/drive_2020q4_48dp.png",
            "drive.google.com",
        ),
        "googlecalendar" => (
            "Google Calendar",
            "https://www.gstatic.com/images/branding/product/2x/calendar_2020q4_48dp.png",
            "calendar.google.com",
        ),
        "googlesheets" => (
            "Google Sheets",
            "https://www.gstatic.com/images/branding/product/2x/sheets_2020q4_48dp.png",
            "sheets.google.com",
        ),
        "slack" => (
            "Slack",
            "https://a.slack-edge.com/80588/marketing/img/meta/slack_hash_256.png",
            "slack.com",
        ),
        "github" => (
            "GitHub",
            "https://github.githubassets.com/assets/GitHub-Mark-ea2971cee799.png",
            "github.com",
        ),
        "notion" => (
            "Notion",
            "https://upload.wikimedia.org/wikipedia/commons/4/45/Notion_app_logo.png",
            "notion.so",
        ),
        "linear" => (
            "Linear",
            "https://linear.app/static/apple-touch-icon.png",
            "linear.app",
        ),
        "discord" => (
            "Discord",
            "https://assets-global.website-files.com/6257adef93867e50d84d30e2/636e0a69f118df70ad7828d4_icon_clyde_blurple_RGB.svg",
            "discord.com",
        ),
        "trello" => (
            "Trello",
            "https://trello.com/apple-touch-icon.png",
            "trello.com",
        ),
        "outlook" => (
            "Outlook",
            "https://outlook.live.com/favicon.ico",
            "outlook.com",
        ),
        "airtable" => (
            "Airtable",
            "https://airtable.com/images/favicon/baymax/apple-touch-icon.png",
            "airtable.com",
        ),
        "googledocs" => (
            "Google Docs",
            "https://www.gstatic.com/images/branding/product/2x/docs_2020q4_48dp.png",
            "docs.google.com",
        ),
        "jira" => (
            "Jira",
            "https://wac-cdn.atlassian.com/assets/img/favicons/atlassian/apple-touch-icon.png",
            "atlassian.com",
        ),
        "asana" => (
            "Asana",
            "https://asana.com/images/fav/apple-touch-icon.png",
            "asana.com",
        ),
        "hubspot" => (
            "HubSpot",
            "https://www.hubspot.com/hubfs/HubSpot_Logos/HubSpot-Inversed-Favicon.png",
            "hubspot.com",
        ),
        "salesforce" => (
            "Salesforce",
            "https://www.salesforce.com/favicon.ico",
            "salesforce.com",
        ),
        "shopify" => (
            "Shopify",
            "https://cdn.shopify.com/shopifycloud/web/assets/v1/favicon.ico",
            "shopify.com",
        ),
        "stripe" => (
            "Stripe",
            "https://stripe.com/favicon.ico",
            "stripe.com",
        ),
        "excel" => (
            "Microsoft Excel",
            "https://res.cdn.office.net/assets/mail/pwa/v1/pngs/favicon_excel.ico",
            "microsoft.com",
        ),
        _ => (tk, "", tk),
    }
}

fn short_description(toolkit: &str) -> String {
    match toolkit {
        "gmail" => "Send and read emails",
        "googledrive" => "Access files and folders",
        "googlecalendar" => "Manage events and schedules",
        "googlesheets" => "Read and edit spreadsheets",
        "slack" => "Send and read messages",
        "github" => "Manage repos and issues",
        "notion" => "Access pages and databases",
        "linear" => "Track issues and projects",
        "discord" => "Send and read messages",
        "trello" => "Manage boards and cards",
        "outlook" => "Send and read emails",
        "airtable" => "Access tables and records",
        _ => "Connected",
    }
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_slugs_return_display_name() {
        assert_eq!(toolkit_display_name("gmail"), "Gmail");
        assert_eq!(toolkit_display_name("slack"), "Slack");
        assert_eq!(toolkit_display_name("googlecalendar"), "Google Calendar");
        assert_eq!(toolkit_display_name("googlesheets"), "Google Sheets");
        assert_eq!(toolkit_display_name("github"), "GitHub");
        assert_eq!(toolkit_display_name("hubspot"), "HubSpot");
        assert_eq!(toolkit_display_name("excel"), "Microsoft Excel");
        assert_eq!(toolkit_display_name("jira"), "Jira");
    }

    #[test]
    fn unknown_slug_falls_back_to_slug() {
        assert_eq!(toolkit_display_name("somerandometool"), "somerandometool");
        assert_eq!(toolkit_display_name("my-custom-app"), "my-custom-app");
    }
}
