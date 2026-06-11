//! Preferences — key/value store backed by SQLite.
//!
//! Transport-neutral: HTTP routes and Tauri proxies call these functions.
//! Relocated from `app/src-tauri/src/commands/preferences.rs`.

use crate::error::{CoreError, CoreResult};
use houston_db::Database;
use serde::{Deserialize, Serialize};

/// Preference key for the user's IANA timezone (e.g. `"America/Bogota"`).
/// Cron schedules without a per-routine override are interpreted in this zone.
pub const TIMEZONE_KEY: &str = "timezone";

/// Preference key for the user's chosen UI locale (BCP-47 base tag such as
/// `"en"`, `"es"`, `"pt"`). Read at app boot by the desktop frontend to
/// pick the initial i18n language. The engine itself is locale-agnostic —
/// this value is surfaced verbatim to whichever frontend is consuming it.
pub const LOCALE_KEY: &str = "locale";

pub async fn get(db: &Database, key: &str) -> CoreResult<Option<String>> {
    db.get_preference(key)
        .await
        .map_err(|e| CoreError::Internal(e.to_string()))
}

pub async fn set(db: &Database, key: &str, value: &str) -> CoreResult<()> {
    db.set_preference(key, value)
        .await
        .map_err(|e| CoreError::Internal(e.to_string()))
}

/// Resolve the user's effective timezone. Returns `"UTC"` if unset.
pub async fn timezone(db: &Database) -> String {
    get(db, TIMEZONE_KEY)
        .await
        .ok()
        .flatten()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "UTC".to_string())
}

/// Resolve the user's effective UI locale. Returns `None` if unset — the
/// frontend then falls back to navigator/browser detection.
pub async fn locale(db: &Database) -> Option<String> {
    get(db, LOCALE_KEY)
        .await
        .ok()
        .flatten()
        .filter(|s| !s.trim().is_empty())
}

// ─── Legal acceptance ────────────────────────────────────────────────

/// Preference key for the user's acceptance of the in-app security
/// disclaimer. The value is a JSON-encoded [`LegalAcceptance`].
pub const LEGAL_ACCEPTANCE_KEY: &str = "legal_acceptance";

/// Persisted record that the user has acknowledged a specific version of
/// the security disclaimer. The frontend re-prompts whenever the stored
/// `version` is lower than the current in-app constant.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegalAcceptance {
    /// Version of the disclaimer the user accepted. Bump in the app's
    /// `legal.ts` to force all users to re-accept.
    pub version: u32,
    /// RFC3339 timestamp captured at the moment of acceptance.
    pub accepted_at: String,
}

/// Fetch the user's stored disclaimer acceptance, if any.
pub async fn get_legal_acceptance(db: &Database) -> CoreResult<Option<LegalAcceptance>> {
    let raw = match get(db, LEGAL_ACCEPTANCE_KEY).await? {
        Some(v) if !v.trim().is_empty() => v,
        _ => return Ok(None),
    };
    match serde_json::from_str::<LegalAcceptance>(&raw) {
        Ok(parsed) => Ok(Some(parsed)),
        // Corrupt / legacy shape: treat as "not yet accepted" so the gate
        // re-prompts. We deliberately do NOT surface this as an error —
        // the user-facing recovery is identical ("accept again").
        Err(_) => Ok(None),
    }
}

/// Persist the user's disclaimer acceptance.
pub async fn set_legal_acceptance(db: &Database, acceptance: &LegalAcceptance) -> CoreResult<()> {
    let encoded = serde_json::to_string(acceptance)
        .map_err(|e| CoreError::Internal(format!("legal_acceptance encode: {e}")))?;
    set(db, LEGAL_ACCEPTANCE_KEY, &encoded).await
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn mem_db() -> Database {
        Database::connect_in_memory().await.unwrap()
    }

    #[tokio::test]
    async fn get_missing_returns_none() {
        let db = mem_db().await;
        assert!(get(&db, "nope").await.unwrap().is_none());
    }

    #[tokio::test]
    async fn set_then_get_roundtrip() {
        let db = mem_db().await;
        set(&db, "theme", "dark").await.unwrap();
        assert_eq!(get(&db, "theme").await.unwrap().as_deref(), Some("dark"));
        set(&db, "theme", "light").await.unwrap();
        assert_eq!(get(&db, "theme").await.unwrap().as_deref(), Some("light"));
    }

    #[tokio::test]
    async fn locale_unset_returns_none() {
        let db = mem_db().await;
        assert!(locale(&db).await.is_none());
    }

    #[tokio::test]
    async fn locale_roundtrip_and_blank_treated_as_unset() {
        let db = mem_db().await;
        set(&db, LOCALE_KEY, "es").await.unwrap();
        assert_eq!(locale(&db).await.as_deref(), Some("es"));
        // Whitespace-only values collapse to None, mirroring timezone().
        set(&db, LOCALE_KEY, "   ").await.unwrap();
        assert!(locale(&db).await.is_none());
    }

    #[tokio::test]
    async fn legal_acceptance_missing_returns_none() {
        let db = mem_db().await;
        assert!(get_legal_acceptance(&db).await.unwrap().is_none());
    }

    #[tokio::test]
    async fn legal_acceptance_roundtrip() {
        let db = mem_db().await;
        let record = LegalAcceptance {
            version: 1,
            accepted_at: "2026-04-22T10:00:00Z".to_string(),
        };
        set_legal_acceptance(&db, &record).await.unwrap();
        let loaded = get_legal_acceptance(&db).await.unwrap().unwrap();
        assert_eq!(loaded, record);

        // Overwrite with a newer version.
        let bumped = LegalAcceptance {
            version: 2,
            accepted_at: "2026-05-01T09:30:00Z".to_string(),
        };
        set_legal_acceptance(&db, &bumped).await.unwrap();
        let loaded = get_legal_acceptance(&db).await.unwrap().unwrap();
        assert_eq!(loaded, bumped);
    }

    #[tokio::test]
    async fn legal_acceptance_corrupt_value_is_treated_as_missing() {
        let db = mem_db().await;
        // Simulate a user who had a preference row written by an older /
        // buggy build that used a different shape.
        set(&db, LEGAL_ACCEPTANCE_KEY, "not-json").await.unwrap();
        assert!(get_legal_acceptance(&db).await.unwrap().is_none());
    }
}
