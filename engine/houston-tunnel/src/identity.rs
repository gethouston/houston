//! Persist `{tunnelId, tunnelToken}` on disk so the same engine keeps the
//! same public-facing URL across restarts.
//!
//! Stored in `<home_dir>/tunnel.json` — separate from `engine.json` (which
//! is created by the desktop supervisor and doesn't belong to the engine).

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TunnelIdentity {
    pub tunnel_id: String,
    pub tunnel_token: String,
    pub public_host: String,
}

fn path(home_dir: &Path) -> PathBuf {
    home_dir.join("tunnel.json")
}

pub fn load(home_dir: &Path) -> Option<TunnelIdentity> {
    let bytes = std::fs::read(path(home_dir)).ok()?;
    serde_json::from_slice(&bytes).ok()
}

pub fn save(home_dir: &Path, id: &TunnelIdentity) -> anyhow::Result<()> {
    std::fs::create_dir_all(home_dir)?;
    let tmp = home_dir.join("tunnel.json.tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(id)?)?;
    std::fs::rename(&tmp, path(home_dir))?;
    Ok(())
}

/// Remove the cached identity so the next call to [`ensure`] hits
/// `/allocate` and mints a fresh one. Safe to call when no file exists.
pub fn invalidate(home_dir: &Path) {
    let _ = std::fs::remove_file(path(home_dir));
}

/// First-boot: POST {relay_base}/allocate → allocate tunnel. Cached afterwards.
///
/// On 429 (Too Many Requests) we honor the server's `Retry-After`
/// header and try once more before giving up. Without the retry, an
/// engine restart loop (e.g. caused by an unrelated crash) hammers
/// `/allocate` with one request per restart, which the relay sees as a
/// burst from one client and bans for the rest of the boot. With the
/// retry — and the cache that the successful call writes — we settle
/// on a single tunnel ID within seconds of the first allowed request.
pub async fn ensure(home_dir: &Path, relay_base: &str) -> anyhow::Result<TunnelIdentity> {
    if let Some(id) = load(home_dir) {
        return Ok(id);
    }
    let url = format!("{}/allocate", relay_base.trim_end_matches('/'));
    let client = reqwest::Client::new();

    let mut attempt = 0;
    let id: TunnelIdentity = loop {
        attempt += 1;
        let resp = client.post(&url).send().await?;
        let status = resp.status();
        if status == reqwest::StatusCode::TOO_MANY_REQUESTS && attempt == 1 {
            // Server-suggested wait, capped at 30s so a misbehaving
            // upstream can't stall engine startup indefinitely.
            let wait_secs = resp
                .headers()
                .get(reqwest::header::RETRY_AFTER)
                .and_then(|h| h.to_str().ok())
                .and_then(|s| s.parse::<u64>().ok())
                .unwrap_or(5)
                .min(30);
            tracing::warn!("tunnel allocation 429 — retrying once in {wait_secs}s per Retry-After");
            tokio::time::sleep(std::time::Duration::from_secs(wait_secs)).await;
            continue;
        }
        let resp = resp.error_for_status()?;
        break resp.json().await?;
    };
    save(home_dir, &id)?;
    Ok(id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip() {
        let tmp = tempfile::tempdir().unwrap();
        let id = TunnelIdentity {
            tunnel_id: "abc".into(),
            tunnel_token: "tok".into(),
            public_host: "tunnel.test".into(),
        };
        save(tmp.path(), &id).unwrap();
        let loaded = load(tmp.path()).unwrap();
        assert_eq!(loaded.tunnel_id, "abc");
        assert_eq!(loaded.public_host, "tunnel.test");
    }

    #[test]
    fn load_missing_returns_none() {
        let tmp = tempfile::tempdir().unwrap();
        assert!(load(tmp.path()).is_none());
    }
}
