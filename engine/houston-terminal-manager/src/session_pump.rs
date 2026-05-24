use super::session_update::SessionUpdate;
use super::types::{FeedItem, SessionStatus};
use tokio::sync::mpsc;

/// Core session pump: reads SessionUpdate messages from the channel,
/// dispatches FeedItem/SessionStatus/session_id/output_file to callbacks.
///
/// This is the generic version — application-specific logic (DB writes, event emission)
/// should be handled in the callbacks.
pub async fn pump_session(
    mut rx: mpsc::UnboundedReceiver<SessionUpdate>,
    session_key: String,
    on_feed: impl Fn(FeedItem),
    on_status: impl Fn(SessionStatus),
    on_session_id: impl Fn(String),
    on_output_file: impl Fn(String),
    on_pid: impl Fn(u32),
) {
    let mut got_terminal = false;
    let mut captured_session_id: Option<String> = None;

    while let Some(update) = rx.recv().await {
        match update {
            SessionUpdate::Feed(item) => {
                // Detect output files from Write/Edit tool calls.
                if let FeedItem::ToolCall {
                    ref name,
                    ref input,
                    ..
                } = item
                {
                    if let Some(path) = extract_output_file(name, input) {
                        on_output_file(path);
                    }
                }
                if let FeedItem::FinalResult { .. } = &item {
                    got_terminal = true;
                }
                on_feed(item);
            }
            SessionUpdate::Status(status) => {
                let is_terminal =
                    matches!(status, SessionStatus::Completed | SessionStatus::Error(_));
                on_status(status);
                if is_terminal {
                    got_terminal = true;
                    break;
                }
            }
            SessionUpdate::SessionId(sid) => {
                captured_session_id = Some(sid.clone());
                on_session_id(sid);
            }
            SessionUpdate::ProcessPid(pid) => {
                on_pid(pid);
            }
            SessionUpdate::ResumeInvalid => {}
        }
    }

    // Safety net: if channel closed without a terminal status, synthesise an error.
    if !got_terminal {
        let sid_info = captured_session_id.as_deref().unwrap_or("unknown");
        tracing::warn!(
            "[houston:pump] channel closed without terminal status (key={}, session={})",
            session_key,
            sid_info
        );
        on_status(SessionStatus::Error(
            "Session ended unexpectedly".to_string(),
        ));
    }
}

/// Extract an output file path from a tool call, if applicable.
fn extract_output_file(name: &str, input: &serde_json::Value) -> Option<String> {
    match name {
        "Write" | "Edit" | "MultiEdit" => input
            .get("file_path")
            .or_else(|| input.get("path"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    #[tokio::test]
    async fn pump_delivers_feed_items() {
        let (tx, rx) = mpsc::unbounded_channel();
        let items: Arc<Mutex<Vec<FeedItem>>> = Arc::new(Mutex::new(Vec::new()));
        let items2 = Arc::clone(&items);

        tx.send(SessionUpdate::Feed(FeedItem::AssistantText("hello".into())))
            .unwrap();
        tx.send(SessionUpdate::Status(SessionStatus::Completed))
            .unwrap();
        drop(tx);

        pump_session(
            rx,
            "test".into(),
            move |item| items2.lock().unwrap().push(item),
            |_| {},
            |_| {},
            |_| {},
            |_| {},
        )
        .await;

        let captured = items.lock().unwrap();
        assert_eq!(captured.len(), 1);
        assert!(matches!(&captured[0], FeedItem::AssistantText(t) if t == "hello"));
    }

    #[tokio::test]
    async fn pump_calls_on_session_id() {
        let (tx, rx) = mpsc::unbounded_channel();
        let sid: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
        let sid2 = Arc::clone(&sid);

        tx.send(SessionUpdate::SessionId("s-123".into())).unwrap();
        tx.send(SessionUpdate::Status(SessionStatus::Completed))
            .unwrap();
        drop(tx);

        pump_session(
            rx,
            "test".into(),
            |_| {},
            |_| {},
            move |s| *sid2.lock().unwrap() = Some(s),
            |_| {},
            |_| {},
        )
        .await;

        assert_eq!(*sid.lock().unwrap(), Some("s-123".to_string()));
    }

    #[tokio::test]
    async fn pump_detects_output_files() {
        let (tx, rx) = mpsc::unbounded_channel();
        let files: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
        let files2 = Arc::clone(&files);

        tx.send(SessionUpdate::Feed(FeedItem::ToolCall {
            name: "Write".into(),
            input: serde_json::json!({"file_path": "/tmp/out.txt"}),
            tool_use_id: None,
        }))
        .unwrap();
        tx.send(SessionUpdate::Status(SessionStatus::Completed))
            .unwrap();
        drop(tx);

        pump_session(
            rx,
            "test".into(),
            |_| {},
            |_| {},
            |_| {},
            move |f| files2.lock().unwrap().push(f),
            |_| {},
        )
        .await;

        let captured = files.lock().unwrap();
        assert_eq!(captured.len(), 1);
        assert_eq!(captured[0], "/tmp/out.txt");
    }

    #[tokio::test]
    async fn pump_synthesises_error_on_unexpected_close() {
        let (tx, rx) = mpsc::unbounded_channel();
        let statuses: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
        let statuses2 = Arc::clone(&statuses);

        // Drop tx without sending a terminal status.
        drop(tx);

        pump_session(
            rx,
            "test".into(),
            |_| {},
            move |s| {
                let label = match s {
                    SessionStatus::Error(e) => format!("error: {e}"),
                    other => format!("{other:?}"),
                };
                statuses2.lock().unwrap().push(label);
            },
            |_| {},
            |_| {},
            |_| {},
        )
        .await;

        let captured = statuses.lock().unwrap();
        assert_eq!(captured.len(), 1);
        assert!(captured[0].contains("unexpectedly"));
    }

    #[test]
    fn extract_output_file_from_write() {
        let input = serde_json::json!({"file_path": "/tmp/out.txt"});
        assert_eq!(
            extract_output_file("Write", &input),
            Some("/tmp/out.txt".to_string())
        );
    }

    #[test]
    fn extract_output_file_from_edit() {
        let input = serde_json::json!({"file_path": "/tmp/edit.rs"});
        assert_eq!(
            extract_output_file("Edit", &input),
            Some("/tmp/edit.rs".to_string())
        );
    }

    #[test]
    fn extract_output_file_from_other_tool() {
        let input = serde_json::json!({"path": "/tmp/foo"});
        assert_eq!(extract_output_file("Read", &input), None);
    }
}
