use crate::db::Database;
use anyhow::Result;

/// A persisted chat feed item row.
pub struct ChatFeedRow {
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
