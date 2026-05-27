//! Tracks provider CLI session IDs per `(agent_dir, provider, session_key)` pair
//! so resume continues the right conversation across turns and app restarts.
//!
//! Current IDs are provider-scoped under `.houston/sessions/{provider}/`.
//! The legacy flat `.houston/sessions/{session_key}.sid` path is still read as a
//! fallback for existing user data.

use houston_terminal_manager::{provider as provider_registry, Provider};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};

/// Iterate every registered provider. Used by history reads that need to
/// sweep all on-disk session-id directories regardless of which provider
/// the user is currently on.
fn all_providers() -> impl Iterator<Item = Provider> {
    provider_registry::all().iter().copied().map(Provider::from)
}

fn sessions_dir(agent_dir: &Path) -> PathBuf {
    agent_dir.join(".houston").join("sessions")
}

/// Return the legacy flat path where older Houston versions persisted a resume ID.
pub fn legacy_session_id_path(agent_dir: &Path, session_key: &str) -> PathBuf {
    agent_dir
        .join(".houston")
        .join("sessions")
        .join(format!("{session_key}.sid"))
}

/// Return the current provider-scoped resume ID path for a conversation.
pub fn session_id_path(agent_dir: &Path, provider: Provider, session_key: &str) -> PathBuf {
    sessions_dir(agent_dir)
        .join(provider.to_string())
        .join(format!("{session_key}.sid"))
}

/// Return the provider-scoped history list path for a conversation.
pub fn session_history_path(agent_dir: &Path, provider: Provider, session_key: &str) -> PathBuf {
    sessions_dir(agent_dir)
        .join(provider.to_string())
        .join(format!("{session_key}.history"))
}

fn session_invalid_path(agent_dir: &Path, provider: Provider, session_key: &str) -> PathBuf {
    sessions_dir(agent_dir)
        .join(provider.to_string())
        .join(format!("{session_key}.invalid"))
}

/// Invalidate current provider resume IDs when an agent's filesystem path is
/// about to change. Provider CLIs can bind resumed conversations to their
/// original working directory; after a path rename, retrying the old current
/// ID can produce a permanent immediate runtime error. History remains
/// readable, but the next turn starts a fresh provider session.
pub fn invalidate_current_session_ids_for_path_change(agent_dir: &Path) -> io::Result<usize> {
    let base = sessions_dir(agent_dir);
    if !base.exists() {
        return Ok(0);
    }

    let mut invalidated = 0usize;
    for provider in all_providers() {
        let provider_dir = base.join(provider.to_string());
        if !provider_dir.exists() {
            continue;
        }
        for entry in fs::read_dir(&provider_dir)? {
            let entry = entry?;
            let path = entry.path();
            if !entry.file_type()?.is_file()
                || path.extension().and_then(|v| v.to_str()) != Some("sid")
            {
                continue;
            }
            let Some(session_key) = path
                .file_stem()
                .and_then(|name| name.to_str())
                .map(str::to_string)
            else {
                continue;
            };
            if invalidate_provider_sid(agent_dir, provider, &session_key, &path)? {
                invalidated += 1;
            }
        }
    }

    for entry in fs::read_dir(&base)? {
        let entry = entry?;
        let path = entry.path();
        if !entry.file_type()?.is_file() || path.extension().and_then(|v| v.to_str()) != Some("sid")
        {
            continue;
        }
        let Some(session_key) = path
            .file_stem()
            .and_then(|name| name.to_str())
            .map(str::to_string)
        else {
            continue;
        };
        if let Some(id) = read_trimmed_file_checked(&path)? {
            for provider in all_providers() {
                append_history_id_checked(
                    &session_invalid_path(agent_dir, provider, &session_key),
                    &id,
                )?;
            }
            invalidated += 1;
        }
    }

    Ok(invalidated)
}

fn invalidate_provider_sid(
    agent_dir: &Path,
    provider: Provider,
    session_key: &str,
    sid_path: &Path,
) -> io::Result<bool> {
    if let Some(id) = read_trimmed_file_checked(sid_path)? {
        append_history_id_checked(&session_history_path(agent_dir, provider, session_key), &id)?;
        append_history_id_checked(&session_invalid_path(agent_dir, provider, session_key), &id)?;
    }

    match fs::remove_file(sid_path) {
        Ok(()) => Ok(true),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(e) => Err(e),
    }
}

/// Return every known resume ID for a session key, across legacy and
/// provider-scoped current/history files. Used for DB-backed chat history.
pub fn session_ids_for_history(agent_dir: &Path, session_key: &str) -> Vec<String> {
    let mut ids = Vec::new();
    let mut seen = HashSet::new();

    push_unique_file_id(
        &mut ids,
        &mut seen,
        &legacy_session_id_path(agent_dir, session_key),
    );

    for provider in all_providers() {
        push_unique_file_id(
            &mut ids,
            &mut seen,
            &session_id_path(agent_dir, provider, session_key),
        );
        for id in read_history_ids(&session_history_path(agent_dir, provider, session_key)) {
            push_unique_id(&mut ids, &mut seen, id);
        }
    }

    ids
}

/// Handle to a single conversation's provider resume ID. Cheap to clone.
/// Setting a new ID persists to disk and records it in provider history.
#[derive(Clone)]
pub struct SessionIdHandle {
    id: Arc<Mutex<Option<String>>>,
    sid_path: PathBuf,
    history_path: PathBuf,
    invalid_path: PathBuf,
}

impl SessionIdHandle {
    /// Get the current resume ID.
    pub async fn get(&self) -> Option<String> {
        self.id.lock().await.clone()
    }

    /// Store a new resume ID and persist it so resume survives app restarts.
    pub async fn set(&self, id: String) {
        *self.id.lock().await = Some(id.clone());
        if let Err(e) = write_atomic(&self.sid_path, &id) {
            tracing::warn!(
                path = %self.sid_path.display(),
                error = %e,
                "failed to persist session id"
            );
        }
        append_history_id(&self.history_path, &id);
    }

    /// Clear the in-memory resume ID. Does not remove the disk file.
    pub async fn clear(&self) {
        *self.id.lock().await = None;
    }

    /// Clear the current provider-scoped resume ID after the CLI rejects it,
    /// while keeping it in history so already-persisted chat rows remain visible.
    pub async fn clear_current_preserving_history(&self) {
        let current = self.id.lock().await.take();
        let current = current.or_else(|| read_trimmed_file(&self.sid_path));
        if let Some(id) = current {
            append_history_id(&self.history_path, &id);
            append_history_id(&self.invalid_path, &id);
        }

        match fs::remove_file(&self.sid_path) {
            Ok(()) => {}
            Err(e) if e.kind() == io::ErrorKind::NotFound => {}
            Err(e) => {
                tracing::warn!(
                    path = %self.sid_path.display(),
                    error = %e,
                    "failed to remove invalid session id"
                );
            }
        }
    }
}

/// Managed state: one `SessionIdHandle` per `(agent_dir, provider, session_key)`.
/// Lazy-loads persisted IDs from disk on first access.
#[derive(Default, Clone)]
pub struct SessionIdTracker {
    inner: Arc<RwLock<HashMap<String, SessionIdHandle>>>,
}

impl SessionIdTracker {
    /// Get (or lazily create) the provider-scoped handle for a conversation.
    ///
    /// `agent_key` is a unique identifier combining agent + provider + session
    /// (e.g. `"{agent_dir}:{provider}:{session_key}"`).
    /// `agent_dir` is the expanded agent filesystem path where
    /// `.houston/sessions/{provider}/{session_key}.sid` is stored.
    pub async fn get_for_session(
        &self,
        agent_key: &str,
        agent_dir: &Path,
        session_key: &str,
        provider: Provider,
    ) -> SessionIdHandle {
        // Fast path: already in memory.
        {
            let map = self.inner.read().await;
            if let Some(handle) = map.get(agent_key) {
                return handle.clone();
            }
        }

        // Slow path: create handle and try to load the persisted ID from disk.
        let sid_path = session_id_path(agent_dir, provider, session_key);
        let history_path = session_history_path(agent_dir, provider, session_key);
        let invalid_path = session_invalid_path(agent_dir, provider, session_key);
        let initial = read_trimmed_file(&sid_path).or_else(|| {
            let legacy = read_trimmed_file(&legacy_session_id_path(agent_dir, session_key))?;
            if read_history_ids(&invalid_path)
                .iter()
                .any(|invalid| invalid == &legacy)
            {
                None
            } else {
                Some(legacy)
            }
        });

        let handle = SessionIdHandle {
            id: Arc::new(Mutex::new(initial)),
            sid_path,
            history_path,
            invalid_path,
        };

        let mut map = self.inner.write().await;
        map.entry(agent_key.to_string()).or_insert(handle).clone()
    }

    /// Remove in-memory handles for a deleted agent.
    /// `agent_key_prefix` should match the `"{agent_dir}:"` prefix used when storing.
    pub async fn remove_agent(&self, agent_key_prefix: &str) {
        let mut map = self.inner.write().await;
        map.retain(|k, _| !k.starts_with(agent_key_prefix));
    }
}

fn push_unique_file_id(ids: &mut Vec<String>, seen: &mut HashSet<String>, path: &Path) {
    if let Some(id) = read_trimmed_file(path) {
        push_unique_id(ids, seen, id);
    }
}

fn push_unique_id(ids: &mut Vec<String>, seen: &mut HashSet<String>, id: String) {
    let id = id.trim().to_string();
    if id.is_empty() || !seen.insert(id.clone()) {
        return;
    }
    ids.push(id);
}

fn read_trimmed_file(path: &Path) -> Option<String> {
    match read_trimmed_file_checked(path) {
        Ok(value) => value,
        Err(e) if e.kind() == io::ErrorKind::NotFound => None,
        Err(e) => {
            tracing::warn!(
                path = %path.display(),
                error = %e,
                "failed to read session id file"
            );
            None
        }
    }
}

fn read_trimmed_file_checked(path: &Path) -> io::Result<Option<String>> {
    match fs::read_to_string(path) {
        Ok(body) => {
            let value = body.trim().to_string();
            Ok((!value.is_empty()).then_some(value))
        }
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e),
    }
}

fn read_history_ids(path: &Path) -> Vec<String> {
    match read_history_ids_checked(path) {
        Ok(ids) => ids,
        Err(e) if e.kind() == io::ErrorKind::NotFound => Vec::new(),
        Err(e) => {
            tracing::warn!(
                path = %path.display(),
                error = %e,
                "failed to read session history file"
            );
            Vec::new()
        }
    }
}

fn read_history_ids_checked(path: &Path) -> io::Result<Vec<String>> {
    let body = match fs::read_to_string(path) {
        Ok(body) => body,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(e),
    };
    let mut ids = Vec::new();
    let mut seen = HashSet::new();
    for line in body.lines() {
        push_unique_id(&mut ids, &mut seen, line.to_string());
    }
    Ok(ids)
}

fn append_history_id(path: &Path, id: &str) {
    if let Err(e) = append_history_id_checked(path, id) {
        tracing::warn!(
            path = %path.display(),
            error = %e,
            "failed to persist session history"
        );
    }
}

fn append_history_id_checked(path: &Path, id: &str) -> io::Result<()> {
    let id = id.trim();
    if id.is_empty() {
        return Ok(());
    }

    let mut ids = read_history_ids_checked(path)?;
    if ids.iter().any(|existing| existing == id) {
        return Ok(());
    }
    ids.push(id.to_string());

    let mut body = ids.join("\n");
    body.push('\n');
    write_atomic(path, &body)
}

fn write_atomic(path: &Path, content: &str) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let file_name = path
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "session".to_string());
    let tmp_path = path.with_file_name(format!("{file_name}.tmp"));
    fs::write(&tmp_path, content)?;
    fs::rename(tmp_path, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn write_file(path: &Path, body: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, body).unwrap();
    }

    fn anthropic() -> Provider {
        "anthropic".parse().unwrap()
    }
    fn openai() -> Provider {
        "openai".parse().unwrap()
    }

    #[test]
    fn provider_paths_are_distinct() {
        let dir = TempDir::new().unwrap();

        let anthropic_path = session_id_path(dir.path(), anthropic(), "chat");
        let openai_path = session_id_path(dir.path(), openai(), "chat");

        assert_ne!(anthropic_path, openai_path);
        assert!(anthropic_path.ends_with(".houston/sessions/anthropic/chat.sid"));
        assert!(openai_path.ends_with(".houston/sessions/openai/chat.sid"));
    }

    #[tokio::test]
    async fn legacy_sid_falls_back_for_provider() {
        let dir = TempDir::new().unwrap();
        write_file(&legacy_session_id_path(dir.path(), "chat"), "legacy-id\n");

        let tracker = SessionIdTracker::default();
        let handle = tracker
            .get_for_session("agent:openai:chat", dir.path(), "chat", openai())
            .await;

        assert_eq!(handle.get().await, Some("legacy-id".to_string()));
    }

    #[tokio::test]
    async fn set_writes_provider_sid_and_history() {
        let dir = TempDir::new().unwrap();
        let tracker = SessionIdTracker::default();
        let handle = tracker
            .get_for_session("agent:openai:chat", dir.path(), "chat", openai())
            .await;

        handle.set("openai-id".to_string()).await;
        handle.set("openai-id".to_string()).await;

        let sid = fs::read_to_string(session_id_path(dir.path(), openai(), "chat")).unwrap();
        let history =
            fs::read_to_string(session_history_path(dir.path(), openai(), "chat")).unwrap();

        assert_eq!(sid, "openai-id");
        assert_eq!(history, "openai-id\n");
        assert!(!legacy_session_id_path(dir.path(), "chat").exists());
    }

    #[tokio::test]
    async fn clear_current_preserving_history_removes_only_current_sid() {
        let dir = TempDir::new().unwrap();
        let tracker = SessionIdTracker::default();
        let handle = tracker
            .get_for_session("agent:openai:chat", dir.path(), "chat", openai())
            .await;

        handle.set("bad-id".to_string()).await;
        handle.clear_current_preserving_history().await;

        assert_eq!(handle.get().await, None);
        assert!(!session_id_path(dir.path(), openai(), "chat").exists());
        let history =
            fs::read_to_string(session_history_path(dir.path(), openai(), "chat")).unwrap();
        let invalid =
            fs::read_to_string(session_invalid_path(dir.path(), openai(), "chat")).unwrap();
        assert_eq!(history, "bad-id\n");
        assert_eq!(invalid, "bad-id\n");
    }

    #[tokio::test]
    async fn invalid_legacy_sid_does_not_fallback_again_for_same_provider() {
        let dir = TempDir::new().unwrap();
        write_file(&legacy_session_id_path(dir.path(), "chat"), "legacy-id\n");

        let tracker = SessionIdTracker::default();
        let handle = tracker
            .get_for_session("agent:openai:chat", dir.path(), "chat", openai())
            .await;
        assert_eq!(handle.get().await, Some("legacy-id".to_string()));

        handle.clear_current_preserving_history().await;

        let restarted_tracker = SessionIdTracker::default();
        let openai_handle = restarted_tracker
            .get_for_session("agent:openai:chat", dir.path(), "chat", openai())
            .await;
        let anthropic_handle = restarted_tracker
            .get_for_session("agent:anthropic:chat", dir.path(), "chat", anthropic())
            .await;

        assert_eq!(openai_handle.get().await, None);
        assert_eq!(anthropic_handle.get().await, Some("legacy-id".to_string()));
    }

    #[tokio::test]
    async fn path_change_invalidation_clears_current_ids_and_blocks_legacy_fallback() {
        let dir = TempDir::new().unwrap();
        write_file(
            &session_id_path(dir.path(), anthropic(), "chat"),
            "claude-current\n",
        );
        write_file(&legacy_session_id_path(dir.path(), "chat"), "legacy-id\n");

        let count = invalidate_current_session_ids_for_path_change(dir.path()).unwrap();

        assert_eq!(count, 2);
        assert!(!session_id_path(dir.path(), anthropic(), "chat").exists());
        assert_eq!(
            fs::read_to_string(session_history_path(dir.path(), anthropic(), "chat")).unwrap(),
            "claude-current\n"
        );
        assert_eq!(
            fs::read_to_string(session_invalid_path(dir.path(), anthropic(), "chat")).unwrap(),
            "claude-current\nlegacy-id\n"
        );
        assert_eq!(
            fs::read_to_string(session_invalid_path(dir.path(), openai(), "chat")).unwrap(),
            "legacy-id\n"
        );

        let restarted_tracker = SessionIdTracker::default();
        let anthropic_handle = restarted_tracker
            .get_for_session("agent:anthropic:chat", dir.path(), "chat", anthropic())
            .await;
        let openai_handle = restarted_tracker
            .get_for_session("agent:openai:chat", dir.path(), "chat", openai())
            .await;

        assert_eq!(anthropic_handle.get().await, None);
        assert_eq!(openai_handle.get().await, None);
    }

    #[test]
    fn session_ids_for_history_reads_legacy_current_and_history_once() {
        let dir = TempDir::new().unwrap();
        write_file(&legacy_session_id_path(dir.path(), "chat"), "legacy\n");
        write_file(
            &session_id_path(dir.path(), anthropic(), "chat"),
            "claude-current\n",
        );
        write_file(
            &session_id_path(dir.path(), openai(), "chat"),
            "codex-current\n",
        );
        write_file(
            &session_history_path(dir.path(), anthropic(), "chat"),
            "legacy\nclaude-old\n",
        );
        write_file(
            &session_history_path(dir.path(), openai(), "chat"),
            "codex-old\ncodex-current\n",
        );

        assert_eq!(
            session_ids_for_history(dir.path(), "chat"),
            vec![
                "legacy".to_string(),
                "claude-current".to_string(),
                "claude-old".to_string(),
                "codex-current".to_string(),
                "codex-old".to_string(),
            ]
        );
    }
}
