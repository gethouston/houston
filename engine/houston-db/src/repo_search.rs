use crate::db::Database;
use anyhow::Result;

/// A single search hit within a session.
#[derive(Debug, Clone, serde::Serialize)]
pub struct SearchResult {
    pub claude_session_id: String,
    pub timestamp: String,
    pub snippet: String,
    pub rank: f64,
}

/// Grouped search results for one session.
#[derive(Debug, Clone, serde::Serialize)]
pub struct SessionSearchResult {
    pub claude_session_id: String,
    pub first_timestamp: String,
    pub last_timestamp: String,
    pub match_count: usize,
    pub snippets: Vec<String>,
}

/// Metadata for a session (no search context).
#[derive(Debug, Clone, serde::Serialize)]
pub struct SessionMetadata {
    pub claude_session_id: String,
    pub first_timestamp: String,
    pub last_timestamp: String,
    pub message_count: usize,
}

/// Sanitize a search query for FTS5.
///
/// - Strips FTS5 metacharacters that could cause parse errors
/// - Wraps each token in double quotes to treat as literal
/// - Joins tokens with implicit AND
pub fn sanitize_fts_query(query: &str) -> String {
    let cleaned: String = query
        .chars()
        .filter(|c| !matches!(c, '*' | '+' | '-' | '^' | '~' | ':' | '{' | '}'))
        .collect();

    cleaned
        .split_whitespace()
        .filter(|t| !t.is_empty())
        .map(|t| {
            // Escape any embedded double quotes
            let escaped = t.replace('"', "\"\"");
            format!("\"{escaped}\"")
        })
        .collect::<Vec<_>>()
        .join(" ")
}

impl Database {
    /// Full-text search across chat_feed, grouped by claude_session_id.
    ///
    /// Returns up to `max_sessions` sessions, each with up to
    /// `max_snippets_per_session` highlighted snippets.
    pub async fn search_sessions(
        &self,
        query: &str,
        exclude_session_id: Option<&str>,
        max_sessions: usize,
        max_snippets_per_session: usize,
    ) -> Result<Vec<SessionSearchResult>> {
        let fts_query = sanitize_fts_query(query);
        if fts_query.is_empty() {
            return Ok(Vec::new());
        }

        // Step 1: Find matching sessions with aggregate data.
        // Build query conditionally to avoid NULL parameter issues.
        let mut sessions = match exclude_session_id {
            Some(exclude_id) => {
                self.search_sessions_excluding(&fts_query, exclude_id, max_sessions)
                    .await?
            }
            None => self.search_sessions_all(&fts_query, max_sessions).await?,
        };

        // Step 2: Fetch top snippets for each session.
        for session in &mut sessions {
            self.fill_session_snippets(&fts_query, session, max_snippets_per_session)
                .await?;
        }

        Ok(sessions)
    }

    async fn search_sessions_all(
        &self,
        fts_query: &str,
        max_sessions: usize,
    ) -> Result<Vec<SessionSearchResult>> {
        let mut rows = self
            .conn()
            .query(
                "SELECT
                    cf.claude_session_id,
                    MIN(cf.timestamp) as first_timestamp,
                    MAX(cf.timestamp) as last_timestamp,
                    COUNT(*) as match_count
                FROM chat_feed_fts
                JOIN chat_feed cf ON cf.id = chat_feed_fts.rowid
                WHERE chat_feed_fts MATCH ?1
                GROUP BY cf.claude_session_id
                ORDER BY MIN(chat_feed_fts.rank)
                LIMIT ?2",
                libsql::params![fts_query.to_string(), max_sessions as i64],
            )
            .await?;

        Self::collect_session_rows(&mut rows).await
    }

    async fn search_sessions_excluding(
        &self,
        fts_query: &str,
        exclude_id: &str,
        max_sessions: usize,
    ) -> Result<Vec<SessionSearchResult>> {
        let mut rows = self
            .conn()
            .query(
                "SELECT
                    cf.claude_session_id,
                    MIN(cf.timestamp) as first_timestamp,
                    MAX(cf.timestamp) as last_timestamp,
                    COUNT(*) as match_count
                FROM chat_feed_fts
                JOIN chat_feed cf ON cf.id = chat_feed_fts.rowid
                WHERE chat_feed_fts MATCH ?1
                AND cf.claude_session_id IS NOT NULL
                AND cf.claude_session_id != ?2
                GROUP BY cf.claude_session_id
                ORDER BY MIN(chat_feed_fts.rank)
                LIMIT ?3",
                libsql::params![
                    fts_query.to_string(),
                    exclude_id.to_string(),
                    max_sessions as i64,
                ],
            )
            .await?;

        Self::collect_session_rows(&mut rows).await
    }

    async fn collect_session_rows(rows: &mut libsql::Rows) -> Result<Vec<SessionSearchResult>> {
        let mut sessions = Vec::new();
        while let Some(row) = rows.next().await? {
            sessions.push(SessionSearchResult {
                claude_session_id: row.get(0)?,
                first_timestamp: row.get(1)?,
                last_timestamp: row.get(2)?,
                match_count: row.get::<i64>(3)? as usize,
                snippets: Vec::new(),
            });
        }
        Ok(sessions)
    }

    async fn fill_session_snippets(
        &self,
        fts_query: &str,
        session: &mut SessionSearchResult,
        max_snippets: usize,
    ) -> Result<()> {
        let mut rows = self
            .conn()
            .query(
                "SELECT snippet(chat_feed_fts, 0, '>>>', '<<<', '...', 40)
                FROM chat_feed_fts
                JOIN chat_feed cf ON cf.id = chat_feed_fts.rowid
                WHERE chat_feed_fts MATCH ?1
                AND cf.claude_session_id = ?2
                ORDER BY chat_feed_fts.rank
                LIMIT ?3",
                libsql::params![
                    fts_query.to_string(),
                    session.claude_session_id.clone(),
                    max_snippets as i64,
                ],
            )
            .await?;

        while let Some(row) = rows.next().await? {
            let snippet: String = row.get(0)?;
            session.snippets.push(snippet);
        }
        Ok(())
    }

    /// List recent sessions (no search). Returns metadata only.
    pub async fn list_recent_sessions(&self, limit: usize) -> Result<Vec<SessionMetadata>> {
        let mut rows = self
            .conn()
            .query(
                "SELECT
                    claude_session_id,
                    MIN(timestamp) as first_timestamp,
                    MAX(timestamp) as last_timestamp,
                    COUNT(*) as message_count
                FROM chat_feed
                WHERE claude_session_id != ''
                GROUP BY claude_session_id
                ORDER BY MAX(timestamp) DESC
                LIMIT ?1",
                libsql::params![limit as i64],
            )
            .await?;

        let mut sessions = Vec::new();
        while let Some(row) = rows.next().await? {
            sessions.push(SessionMetadata {
                claude_session_id: row.get(0)?,
                first_timestamp: row.get(1)?,
                last_timestamp: row.get(2)?,
                message_count: row.get::<i64>(3)? as usize,
            });
        }
        Ok(sessions)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn setup_db() -> Database {
        Database::connect_in_memory().await.unwrap()
    }

    async fn insert_message(db: &Database, session_id: &str, json: &str) {
        db.add_chat_feed_item_by_session(session_id, "assistant", json, "desktop")
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn test_search_sessions_with_matches() {
        let db = setup_db().await;
        insert_message(&db, "sess-1", r#"{"text":"hello world"}"#).await;
        insert_message(&db, "sess-1", r#"{"text":"rust programming"}"#).await;
        insert_message(&db, "sess-2", r#"{"text":"hello rust"}"#).await;
        insert_message(&db, "sess-3", r#"{"text":"unrelated content"}"#).await;

        let results = db.search_sessions("hello", None, 10, 3).await.unwrap();
        assert_eq!(results.len(), 2);

        let session_ids: Vec<&str> = results
            .iter()
            .map(|r| r.claude_session_id.as_str())
            .collect();
        assert!(session_ids.contains(&"sess-1"));
        assert!(session_ids.contains(&"sess-2"));

        // Each result should have snippets
        for r in &results {
            assert!(!r.snippets.is_empty());
        }
    }

    #[tokio::test]
    async fn test_search_sessions_no_matches() {
        let db = setup_db().await;
        insert_message(&db, "sess-1", r#"{"text":"hello world"}"#).await;

        let results = db
            .search_sessions("nonexistent", None, 10, 3)
            .await
            .unwrap();
        assert!(results.is_empty());
    }

    #[tokio::test]
    async fn test_search_sessions_exclude() {
        let db = setup_db().await;
        insert_message(&db, "sess-1", r#"{"text":"hello world"}"#).await;
        insert_message(&db, "sess-2", r#"{"text":"hello rust"}"#).await;

        let results = db
            .search_sessions("hello", Some("sess-1"), 10, 3)
            .await
            .unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].claude_session_id, "sess-2");
    }

    #[tokio::test]
    async fn test_search_sessions_empty_query() {
        let db = setup_db().await;
        insert_message(&db, "sess-1", r#"{"text":"hello"}"#).await;

        let results = db.search_sessions("", None, 10, 3).await.unwrap();
        assert!(results.is_empty());

        let results = db.search_sessions("   ", None, 10, 3).await.unwrap();
        assert!(results.is_empty());
    }

    #[tokio::test]
    async fn test_search_sessions_empty_database() {
        let db = setup_db().await;
        let results = db.search_sessions("hello", None, 10, 3).await.unwrap();
        assert!(results.is_empty());
    }

    #[tokio::test]
    async fn test_list_recent_sessions() {
        let db = setup_db().await;
        insert_message(&db, "sess-1", r#"{"text":"first"}"#).await;
        insert_message(&db, "sess-1", r#"{"text":"second"}"#).await;
        insert_message(&db, "sess-2", r#"{"text":"third"}"#).await;

        let sessions = db.list_recent_sessions(10).await.unwrap();
        assert_eq!(sessions.len(), 2);
        // Most recent first
        assert_eq!(sessions[0].claude_session_id, "sess-2");
        assert_eq!(sessions[0].message_count, 1);
        assert_eq!(sessions[1].claude_session_id, "sess-1");
        assert_eq!(sessions[1].message_count, 2);
    }

    #[tokio::test]
    async fn test_list_recent_sessions_empty() {
        let db = setup_db().await;
        let sessions = db.list_recent_sessions(10).await.unwrap();
        assert!(sessions.is_empty());
    }

    #[tokio::test]
    async fn test_list_recent_sessions_limit() {
        let db = setup_db().await;
        insert_message(&db, "sess-1", r#"{"text":"a"}"#).await;
        insert_message(&db, "sess-2", r#"{"text":"b"}"#).await;
        insert_message(&db, "sess-3", r#"{"text":"c"}"#).await;

        let sessions = db.list_recent_sessions(2).await.unwrap();
        assert_eq!(sessions.len(), 2);
    }

    #[test]
    fn test_sanitize_fts_query_simple() {
        assert_eq!(sanitize_fts_query("hello world"), "\"hello\" \"world\"");
    }

    #[test]
    fn test_sanitize_fts_query_strips_metacharacters() {
        assert_eq!(
            sanitize_fts_query("hello* +world -bad"),
            "\"hello\" \"world\" \"bad\""
        );
    }

    #[test]
    fn test_sanitize_fts_query_empty() {
        assert_eq!(sanitize_fts_query(""), "");
        assert_eq!(sanitize_fts_query("   "), "");
        assert_eq!(sanitize_fts_query("***"), "");
    }

    #[test]
    fn test_sanitize_fts_query_with_quotes() {
        assert_eq!(
            sanitize_fts_query(r#"hello "world""#),
            "\"hello\" \"\"\"world\"\"\""
        );
    }

    #[test]
    fn test_sanitize_fts_query_preserves_normal_chars() {
        assert_eq!(
            sanitize_fts_query("rust programming 2024"),
            "\"rust\" \"programming\" \"2024\""
        );
    }

    #[test]
    fn test_sanitize_fts_query_unicode() {
        assert_eq!(sanitize_fts_query("cafe"), "\"cafe\"");
    }
}
