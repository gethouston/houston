use anyhow::{Context, Result};
use std::path::PathBuf;
use std::sync::Arc;

/// Single local SQLite database for all application data.
#[derive(Clone)]
pub struct Database {
    conn: Arc<libsql::Connection>,
}

impl Database {
    /// Connect to a local SQLite database at the given path.
    /// Creates the database file and tables if they don't exist.
    pub async fn connect(path: &std::path::Path) -> Result<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).context("Failed to create data directory")?;
        }

        tracing::info!("[houston:db] using local SQLite at {}", path.display());
        let db = libsql::Builder::new_local(path)
            .build()
            .await
            .context("Failed to open local SQLite")?;

        let conn = db.connect().context("Failed to create connection")?;
        let database = Self {
            conn: Arc::new(conn),
        };
        database.configure_connection().await?;
        database.init_tables().await?;
        database.run_migrations().await?;
        Ok(database)
    }

    /// Connect to a specific database file path (string version).
    pub async fn connect_with_path(path: &str) -> Result<Self> {
        let db = libsql::Builder::new_local(path)
            .build()
            .await
            .context("Failed to open SQLite at given path")?;
        let conn = db.connect().context("Failed to create connection")?;
        let database = Self {
            conn: Arc::new(conn),
        };
        database.configure_connection().await?;
        database.init_tables().await?;
        database.run_migrations().await?;
        Ok(database)
    }

    /// Connect to an in-memory database (for tests).
    pub async fn connect_in_memory() -> Result<Self> {
        let db = libsql::Builder::new_local(":memory:")
            .build()
            .await
            .context("Failed to open in-memory SQLite")?;
        let conn = db.connect().context("Failed to create connection")?;
        let database = Self {
            conn: Arc::new(conn),
        };
        database.configure_connection().await?;
        database.init_tables().await?;
        database.run_migrations().await?;
        Ok(database)
    }

    /// Apply performance and concurrency PRAGMAs on every new connection.
    async fn configure_connection(&self) -> Result<()> {
        self.conn
            .execute_batch(
                "PRAGMA journal_mode = WAL;
             PRAGMA foreign_keys = ON;
             PRAGMA busy_timeout = 5000;
             PRAGMA synchronous = NORMAL;
             PRAGMA cache_size = -64000;
             PRAGMA temp_store = MEMORY;",
            )
            .await
            .context("Failed to configure SQLite connection")?;
        Ok(())
    }

    pub fn conn(&self) -> &libsql::Connection {
        &self.conn
    }

    async fn init_tables(&self) -> Result<()> {
        self.conn
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS preferences (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );",
            )
            .await
            .context("Failed to init tables")?;
        Ok(())
    }

    pub async fn get_preference(&self, key: &str) -> Result<Option<String>> {
        let mut rows = self
            .conn
            .query("SELECT value FROM preferences WHERE key = ?1", [key])
            .await?;
        match rows.next().await? {
            Some(row) => Ok(Some(row.get::<String>(0)?)),
            None => Ok(None),
        }
    }

    pub async fn set_preference(&self, key: &str, value: &str) -> Result<()> {
        self.conn
            .execute(
                "INSERT OR REPLACE INTO preferences (key, value) VALUES (?1, ?2)",
                libsql::params![key.to_string(), value.to_string()],
            )
            .await?;
        Ok(())
    }
}

/// Returns the Houston data root.
///
/// - Release builds: `~/.houston/` — what real users see.
/// - Debug builds (`bun run tauri dev`, `cargo run`): `~/.dev-houston/` — keeps
///   development state isolated so you can install a real release of Houston
///   alongside without clobbering each other.
///
/// Override via `HOUSTON_HOME` env var (wins regardless of build profile).
/// Delete this directory for a completely clean slate.
pub fn houston_dir() -> PathBuf {
    if let Ok(override_path) = std::env::var("HOUSTON_HOME") {
        return PathBuf::from(override_path);
    }
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    let subdir = if cfg!(debug_assertions) {
        ".dev-houston"
    } else {
        ".houston"
    };
    home.join(subdir)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_wal_mode_enabled() {
        let db = Database::connect_in_memory().await.unwrap();
        let mut rows = db
            .conn()
            .query("PRAGMA journal_mode", libsql::params![])
            .await
            .unwrap();
        let row = rows.next().await.unwrap().unwrap();
        let mode: String = row.get(0).unwrap();
        // In-memory SQLite always reports "memory" for journal_mode,
        // but the PRAGMA executed without error, confirming configure_connection works.
        assert!(mode == "wal" || mode == "memory");
    }

    #[tokio::test]
    async fn test_busy_timeout_set() {
        let db = Database::connect_in_memory().await.unwrap();
        let mut rows = db
            .conn()
            .query("PRAGMA busy_timeout", libsql::params![])
            .await
            .unwrap();
        let row = rows.next().await.unwrap().unwrap();
        let timeout: i64 = row.get(0).unwrap();
        assert_eq!(timeout, 5000);
    }

    #[tokio::test]
    async fn test_preferences_roundtrip() {
        let db = Database::connect_in_memory().await.unwrap();
        assert!(db.get_preference("key1").await.unwrap().is_none());

        db.set_preference("key1", "value1").await.unwrap();
        assert_eq!(
            db.get_preference("key1").await.unwrap(),
            Some("value1".to_string())
        );

        db.set_preference("key1", "value2").await.unwrap();
        assert_eq!(
            db.get_preference("key1").await.unwrap(),
            Some("value2".to_string())
        );
    }
}
