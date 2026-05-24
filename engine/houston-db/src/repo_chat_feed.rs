use crate::db::Database;
use anyhow::Result;

/// A persisted chat feed item row.
pub struct ChatFeedRow {
    pub feed_type: String,
    pub data_json: String,
    pub source: String,
    pub timestamp: String,
}

/// A chat feed item annotated with its session — used by the cross-session
/// timeline view (Phase 4 of RFC #248 / `advanced.timeline`).
pub struct ChatFeedRowWithSession {
    pub claude_session_id: String,
    pub feed_type: String,
    pub data_json: String,
    pub source: String,
    pub timestamp: String,
}

impl Database {
    /// Add a feed item keyed by claude_session_id.
    pub async fn add_chat_feed_item_by_session(
        &self,
        claude_session_id: &str,
        feed_type: &str,
        data_json: &str,
        source: &str,
    ) -> Result<()> {
        let now = chrono::Utc::now().to_rfc3339();
        self.conn()
            .execute(
                "INSERT INTO chat_feed (claude_session_id, feed_type, data_json, source, timestamp)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                libsql::params![
                    claude_session_id.to_string(),
                    feed_type.to_string(),
                    data_json.to_string(),
                    source.to_string(),
                    now,
                ],
            )
            .await?;
        Ok(())
    }

    /// Load all feed items for a claude session, ordered chronologically.
    pub async fn list_chat_feed_by_session(
        &self,
        claude_session_id: &str,
    ) -> Result<Vec<ChatFeedRow>> {
        let mut rows = self
            .conn()
            .query(
                "SELECT feed_type, data_json, source, timestamp FROM chat_feed
                 WHERE claude_session_id = ?1
                 ORDER BY id ASC",
                libsql::params![claude_session_id.to_string()],
            )
            .await?;

        let mut items = Vec::new();
        while let Some(row) = rows.next().await? {
            items.push(ChatFeedRow {
                feed_type: row.get(0)?,
                data_json: row.get(1)?,
                source: row.get(2)?,
                timestamp: row.get(3)?,
            });
        }
        Ok(items)
    }

    /// Load chat feed items across multiple sessions, ordered by timestamp
    /// descending (newest first). Bounded by `limit` to avoid blasting a
    /// year of activity at the UI in one call.
    ///
    /// Used by the `advanced.timeline` view (Phase 4 of RFC #248). The
    /// caller passes the agent's known session ids (typically derived from
    /// `.houston/activity/activity.json`); the engine doesn't try to walk
    /// agent → activities → sessions itself — that mapping is a frontend
    /// concept.
    pub async fn list_chat_feed_by_sessions(
        &self,
        claude_session_ids: &[String],
        limit: u32,
    ) -> Result<Vec<ChatFeedRowWithSession>> {
        if claude_session_ids.is_empty() {
            return Ok(Vec::new());
        }
        // Build a parameterized IN(?, ?, ?) clause. libsql doesn't expose a
        // first-class array binder so we hand-roll the placeholder list and
        // expand the params vec.
        let placeholders = (0..claude_session_ids.len())
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(",");
        let sql = format!(
            "SELECT claude_session_id, feed_type, data_json, source, timestamp \
             FROM chat_feed \
             WHERE claude_session_id IN ({placeholders}) \
             ORDER BY timestamp DESC, id DESC \
             LIMIT ?"
        );
        let mut params: Vec<libsql::Value> = claude_session_ids
            .iter()
            .map(|s| libsql::Value::Text(s.clone()))
            .collect();
        params.push(libsql::Value::Integer(limit as i64));
        let mut rows = self.conn().query(&sql, params).await?;
        let mut items = Vec::new();
        while let Some(row) = rows.next().await? {
            items.push(ChatFeedRowWithSession {
                claude_session_id: row.get(0)?,
                feed_type: row.get(1)?,
                data_json: row.get(2)?,
                source: row.get(3)?,
                timestamp: row.get(4)?,
            });
        }
        Ok(items)
    }

    /// Clear all chat feed items for a claude session.
    pub async fn clear_chat_feed_by_session(&self, claude_session_id: &str) -> Result<()> {
        self.conn()
            .execute(
                "DELETE FROM chat_feed WHERE claude_session_id = ?1",
                libsql::params![claude_session_id.to_string()],
            )
            .await?;
        Ok(())
    }
}
