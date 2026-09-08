use futures_util::StreamExt;
use std::time::Duration;

/// Readiness exposes only the registered model and requires actual presence.
pub(crate) async fn selected(
    response: reqwest::Response,
    model: &str,
) -> Result<Vec<u8>, &'static str> {
    if !response.status().is_success() {
        return Err("model_unavailable");
    }
    let mut source = response.bytes_stream();
    let mut body = Vec::new();
    while let Some(chunk) = tokio::time::timeout(Duration::from_secs(10), source.next())
        .await
        .map_err(|_| "timeout")?
    {
        let chunk = chunk.map_err(|_| "upstream_failed")?;
        if body.len() + chunk.len() > 1048576 {
            return Err("upstream_failed");
        }
        body.extend_from_slice(&chunk);
    }
    let value: serde_json::Value = serde_json::from_slice(&body).map_err(|_| "upstream_failed")?;
    let available = value
        .get("data")
        .and_then(|v| v.as_array())
        .is_some_and(|models| {
            models
                .iter()
                .any(|entry| entry.get("id").and_then(|id| id.as_str()) == Some(model))
        });
    if !available {
        return Err("model_unavailable");
    }
    serde_json::to_vec(&serde_json::json!({"object":"list","data":[{"id":model,"object":"model"}]}))
        .map_err(|_| "upstream_failed")
}
