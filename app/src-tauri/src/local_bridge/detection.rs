//! Detect locally-running OpenAI-compatible model servers (LM Studio :1234,
//! Jan :1337, Ollama :11434). Each port is probed concurrently with a short
//! timeout so the UI never hangs; an unreachable port is reported with
//! `reachable: false` rather than dropped, so the frontend can render "not
//! running" states. Probe failures per-port are expected (connection refused
//! when the server isn't up) and are NOT user-initiated errors to surface —
//! they map to `reachable: false`.

use std::time::Duration;

use serde::Serialize;

/// Which local server a probed port belongs to. Serialized lowercase to match
/// the pinned `kind` values the frontend switches on.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ServerKind {
    Lmstudio,
    Jan,
    Ollama,
    #[allow(dead_code)]
    Unknown,
}

/// One probed candidate. Fields serialize camelCase (`baseUrl`) to match the
/// repo's command-return convention.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedServer {
    pub kind: ServerKind,
    pub base_url: String,
    pub port: u16,
    pub models: Vec<String>,
    pub reachable: bool,
}

/// Short per-request timeout so a wedged/slow server can't stall detection.
const PROBE_TIMEOUT: Duration = Duration::from_millis(500);

/// The well-known local servers we probe, in a stable order.
const CANDIDATES: &[(ServerKind, u16)] = &[
    (ServerKind::Lmstudio, 1234),
    (ServerKind::Jan, 1337),
    (ServerKind::Ollama, 11434),
];

/// Probe every candidate port concurrently and return one [`DetectedServer`]
/// each. Always returns a full list (unreachable ports included).
pub async fn detect() -> Vec<DetectedServer> {
    let client = match reqwest::Client::builder().timeout(PROBE_TIMEOUT).build() {
        Ok(c) => c,
        Err(e) => {
            // Building a client only fails on a broken TLS backend; degrade to
            // "nothing reachable" rather than erroring the whole command.
            tracing::warn!("[local-bridge] detection client build failed: {e}");
            return CANDIDATES
                .iter()
                .map(|&(kind, port)| unreachable_server(kind, port))
                .collect();
        }
    };

    let mut handles = Vec::with_capacity(CANDIDATES.len());
    for &(kind, port) in CANDIDATES {
        let client = client.clone();
        handles.push(tokio::spawn(
            async move { probe(&client, kind, port).await },
        ));
    }

    let mut out = Vec::with_capacity(handles.len());
    for (handle, &(kind, port)) in handles.into_iter().zip(CANDIDATES.iter()) {
        match handle.await {
            Ok(server) => out.push(server),
            Err(e) => {
                tracing::warn!("[local-bridge] probe task for {port} panicked: {e}");
                out.push(unreachable_server(kind, port));
            }
        }
    }
    out
}

fn unreachable_server(kind: ServerKind, port: u16) -> DetectedServer {
    DetectedServer {
        kind,
        base_url: format!("http://127.0.0.1:{port}"),
        port,
        models: Vec::new(),
        reachable: false,
    }
}

/// Probe one port: hit the OpenAI `/v1/models` endpoint and, for Ollama, also
/// its native `/api/tags`. Any 2xx marks the server reachable and contributes
/// its model ids.
async fn probe(client: &reqwest::Client, kind: ServerKind, port: u16) -> DetectedServer {
    let origin = format!("http://127.0.0.1:{port}");
    let mut models: Vec<String> = Vec::new();
    let mut reachable = false;

    if let Ok(resp) = client.get(format!("{origin}/v1/models")).send().await {
        if resp.status().is_success() {
            reachable = true;
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                merge(&mut models, parse_openai_models(&json));
            }
        }
    }

    if matches!(kind, ServerKind::Ollama) {
        if let Ok(resp) = client.get(format!("{origin}/api/tags")).send().await {
            if resp.status().is_success() {
                reachable = true;
                if let Ok(json) = resp.json::<serde_json::Value>().await {
                    merge(&mut models, parse_ollama_tags(&json));
                }
            }
        }
    }

    DetectedServer {
        kind,
        base_url: origin,
        port,
        models,
        reachable,
    }
}

fn merge(into: &mut Vec<String>, more: Vec<String>) {
    for m in more {
        if !into.contains(&m) {
            into.push(m);
        }
    }
}

/// Pull model ids from an OpenAI `/v1/models` payload (`{ "data": [{ "id" }] }`).
fn parse_openai_models(json: &serde_json::Value) -> Vec<String> {
    json.get("data")
        .and_then(|d| d.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m.get("id").and_then(|v| v.as_str()).map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

/// Pull model names from an Ollama `/api/tags` payload
/// (`{ "models": [{ "name" }] }`).
fn parse_ollama_tags(json: &serde_json::Value) -> Vec<String> {
    json.get("models")
        .and_then(|m| m.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m.get("name").and_then(|v| v.as_str()).map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_openai_model_ids() {
        let json = serde_json::json!({
            "object": "list",
            "data": [
                { "id": "llama-3.1-8b", "object": "model" },
                { "id": "qwen2.5-coder", "object": "model" }
            ]
        });
        assert_eq!(
            parse_openai_models(&json),
            vec!["llama-3.1-8b".to_string(), "qwen2.5-coder".to_string()]
        );
    }

    #[test]
    fn openai_models_empty_when_shape_wrong() {
        // A malformed / unexpected body yields no models, not a panic.
        assert!(parse_openai_models(&serde_json::json!({ "oops": true })).is_empty());
        assert!(parse_openai_models(&serde_json::json!([])).is_empty());
    }

    #[test]
    fn parses_ollama_tag_names() {
        let json = serde_json::json!({
            "models": [
                { "name": "llama3.2:latest", "size": 123 },
                { "name": "mistral:7b" }
            ]
        });
        assert_eq!(
            parse_ollama_tags(&json),
            vec!["llama3.2:latest".to_string(), "mistral:7b".to_string()]
        );
    }

    #[test]
    fn merge_dedupes() {
        let mut into = vec!["a".to_string()];
        merge(&mut into, vec!["a".to_string(), "b".to_string()]);
        assert_eq!(into, vec!["a".to_string(), "b".to_string()]);
    }

    #[tokio::test]
    async fn unreachable_port_reports_not_reachable() {
        // Port 1 is never a local model server → reachable:false, empty models,
        // and detection must not hang (bounded by PROBE_TIMEOUT).
        let client = reqwest::Client::builder()
            .timeout(PROBE_TIMEOUT)
            .build()
            .unwrap();
        let server = probe(&client, ServerKind::Unknown, 1).await;
        assert!(!server.reachable);
        assert!(server.models.is_empty());
        assert_eq!(server.base_url, "http://127.0.0.1:1");
    }
}
