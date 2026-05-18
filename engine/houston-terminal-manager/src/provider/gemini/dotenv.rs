//! `~/.gemini/.env` probe — companion to [`super`]'s `probe_auth`.
//!
//! The engine writes API keys here via
//! `houston_engine_core::provider::set_gemini_api_key`; the gemini-cli
//! reads it at startup. We parse the same file from the auth probe so
//! the picker card transitions to "Connected" on the very next status
//! poll, with no Houston restart.

use super::{read_file_with_timeout, ReadOutcome};
use std::path::Path;

/// Result of probing `~/.gemini/.env` for a `GEMINI_API_KEY=` entry.
///
/// `Absent` means "file missing or has no key", not "I/O failed" — the
/// adapter keeps falling through to settings.json in that case.
#[derive(Debug, PartialEq, Eq)]
pub(super) enum DotenvProbe {
    Authenticated,
    Absent,
    Unreadable,
}

pub(super) async fn probe_dotenv(gemini_dir: &Path) -> DotenvProbe {
    let env_path = gemini_dir.join(".env");
    let bytes = match read_file_with_timeout(&env_path).await {
        ReadOutcome::Ok(b) => b,
        ReadOutcome::NotFound => return DotenvProbe::Absent,
        ReadOutcome::Error => return DotenvProbe::Unreadable,
    };
    let text = match std::str::from_utf8(&bytes) {
        Ok(s) => s,
        Err(_) => return DotenvProbe::Unreadable,
    };
    if extract_dotenv_value(text, "GEMINI_API_KEY").is_some()
        || extract_dotenv_value(text, "GOOGLE_API_KEY").is_some()
    {
        DotenvProbe::Authenticated
    } else {
        DotenvProbe::Absent
    }
}

/// Returns the trimmed value of `KEY=...` from a dotenv-formatted body
/// if present and non-empty. Accepts the bare and `export `-prefixed
/// forms. Quotes around the value are stripped. Empty values count as
/// absent so the user can wipe a key by clearing it.
fn extract_dotenv_value(text: &str, key: &str) -> Option<String> {
    for line in text.lines() {
        let trimmed = line.trim_start();
        let body = trimmed.strip_prefix("export ").unwrap_or(trimmed);
        let Some(rest) = body.strip_prefix(key) else {
            continue;
        };
        let Some(value) = rest.strip_prefix('=') else {
            continue;
        };
        let cleaned = value
            .trim()
            .trim_matches('"')
            .trim_matches('\'')
            .trim()
            .to_string();
        if !cleaned.is_empty() {
            return Some(cleaned);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use tempfile::TempDir;

    fn write_dotenv(dir: &PathBuf, body: &str) {
        fs::create_dir_all(dir).unwrap();
        fs::write(dir.join(".env"), body).unwrap();
    }

    #[tokio::test]
    async fn dotenv_with_non_empty_key_is_authenticated() {
        let tmp = TempDir::new().unwrap();
        let gemini_dir = tmp.path().join(".gemini");
        write_dotenv(&gemini_dir, "GEMINI_API_KEY=AIzaTestKey1234567890\n");
        assert_eq!(probe_dotenv(&gemini_dir).await, DotenvProbe::Authenticated);
    }

    #[tokio::test]
    async fn dotenv_with_quoted_value_is_authenticated() {
        let tmp = TempDir::new().unwrap();
        let gemini_dir = tmp.path().join(".gemini");
        write_dotenv(&gemini_dir, "GEMINI_API_KEY=\"AIzaTestKey1234567890\"\n");
        assert_eq!(probe_dotenv(&gemini_dir).await, DotenvProbe::Authenticated);
    }

    #[tokio::test]
    async fn dotenv_with_export_prefix_is_authenticated() {
        let tmp = TempDir::new().unwrap();
        let gemini_dir = tmp.path().join(".gemini");
        write_dotenv(&gemini_dir, "export GEMINI_API_KEY=AIzaTestKey1234567890\n");
        assert_eq!(probe_dotenv(&gemini_dir).await, DotenvProbe::Authenticated);
    }

    #[tokio::test]
    async fn dotenv_missing_file_is_absent() {
        let tmp = TempDir::new().unwrap();
        let gemini_dir = tmp.path().join(".gemini");
        // dir doesn't even exist
        assert_eq!(probe_dotenv(&gemini_dir).await, DotenvProbe::Absent);
    }

    #[tokio::test]
    async fn dotenv_with_empty_key_value_is_absent() {
        let tmp = TempDir::new().unwrap();
        let gemini_dir = tmp.path().join(".gemini");
        write_dotenv(&gemini_dir, "GEMINI_API_KEY=\nOTHER=hello\n");
        assert_eq!(probe_dotenv(&gemini_dir).await, DotenvProbe::Absent);
    }

    #[tokio::test]
    async fn dotenv_without_key_falls_through() {
        let tmp = TempDir::new().unwrap();
        let gemini_dir = tmp.path().join(".gemini");
        write_dotenv(&gemini_dir, "OTHER_VAR=hello\n");
        assert_eq!(probe_dotenv(&gemini_dir).await, DotenvProbe::Absent);
    }

    #[tokio::test]
    async fn dotenv_google_api_key_is_authenticated() {
        let tmp = TempDir::new().unwrap();
        let gemini_dir = tmp.path().join(".gemini");
        write_dotenv(&gemini_dir, "GOOGLE_API_KEY=AIzaTestKey1234567890\n");
        assert_eq!(probe_dotenv(&gemini_dir).await, DotenvProbe::Authenticated);
    }

    #[test]
    fn extract_dotenv_value_strips_quotes_and_trims() {
        assert_eq!(
            extract_dotenv_value("GEMINI_API_KEY=  \"hello\"  \n", "GEMINI_API_KEY")
                .as_deref(),
            Some("hello")
        );
        assert_eq!(
            extract_dotenv_value("GEMINI_API_KEY='single'\n", "GEMINI_API_KEY")
                .as_deref(),
            Some("single")
        );
        assert_eq!(
            extract_dotenv_value("OTHER=foo\n", "GEMINI_API_KEY"),
            None
        );
        assert_eq!(
            extract_dotenv_value("GEMINI_API_KEY=\n", "GEMINI_API_KEY"),
            None
        );
    }
}
