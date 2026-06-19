//! CRUD operations for `.houston/meetings/meetings.json` and meeting lifecycle.

use super::store::{read_json, with_json_file_lock, write_json};
use crate::error::{CoreError, CoreResult};
use chrono::Utc;
use houston_agent_files as files;
use houston_agents_conversations::session_runner;
use houston_ui_events::{DynEventSink, HoustonEvent};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fmt;
use std::path::{Path, PathBuf};
use std::str::FromStr;
use uuid::Uuid;

const FILE: &str = "meetings";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MeetingStatus {
    Upcoming,
    Live,
    Processing,
    Completed,
    Error,
}

impl fmt::Display for MeetingStatus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Upcoming => write!(f, "upcoming"),
            Self::Live => write!(f, "live"),
            Self::Processing => write!(f, "processing"),
            Self::Completed => write!(f, "completed"),
            Self::Error => write!(f, "error"),
        }
    }
}

impl FromStr for MeetingStatus {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "upcoming" => Ok(Self::Upcoming),
            "live" => Ok(Self::Live),
            "processing" => Ok(Self::Processing),
            "completed" => Ok(Self::Completed),
            "error" => Ok(Self::Error),
            _ => Err(format!("unknown meeting status: {s}")),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Meeting {
    pub id: String,
    pub title: String,
    pub meet_url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bot_name: Option<String>,
    pub status: MeetingStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub context: Option<String>,
    #[serde(default)]
    pub participants: Vec<String>,
    #[serde(default)]
    pub caption_count: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(default)]
    pub action_items_count: u32,
    #[serde(default)]
    pub summary_ready: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scheduled_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub started_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ended_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewMeeting {
    pub title: String,
    pub meet_url: String,
    #[serde(default)]
    pub bot_name: Option<String>,
    /// Initial status; defaults to `Upcoming` when absent.
    #[serde(default)]
    pub status: Option<MeetingStatus>,
    #[serde(default)]
    pub context: Option<String>,
    #[serde(default)]
    pub scheduled_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MeetingUpdate {
    pub status: Option<MeetingStatus>,
    pub title: Option<String>,
    pub bot_name: Option<String>,
    pub participants: Option<Vec<String>>,
    pub caption_count: Option<u32>,
    pub action_items_count: Option<u32>,
    pub summary_ready: Option<bool>,
    pub summary: Option<String>,
    /// `Some(Some(msg))` sets the message; `Some(None)` clears it.
    pub error_message: Option<Option<String>>,
    /// `Some(Some(ts))` sets; `Some(None)` clears.
    pub started_at: Option<Option<String>>,
    /// `Some(Some(ts))` sets; `Some(None)` clears.
    pub ended_at: Option<Option<String>>,
}

pub fn list(root: &Path) -> CoreResult<Vec<Meeting>> {
    read_json::<Vec<Meeting>>(root, FILE)
}

pub fn create(root: &Path, input: NewMeeting) -> CoreResult<Meeting> {
    let mut items = list(root)?;
    let now = Utc::now().to_rfc3339();
    let item = Meeting {
        id: Uuid::new_v4().to_string(),
        title: input.title,
        meet_url: input.meet_url,
        bot_name: input.bot_name,
        status: input.status.unwrap_or(MeetingStatus::Upcoming),
        context: input.context,
        participants: Vec::new(),
        caption_count: 0,
        summary: None,
        action_items_count: 0,
        summary_ready: false,
        error_message: None,
        scheduled_at: input.scheduled_at,
        started_at: None,
        ended_at: None,
        created_at: now.clone(),
        updated_at: now,
    };
    items.push(item.clone());
    write_json(root, FILE, &items)?;
    Ok(item)
}

pub fn update(root: &Path, id: &str, updates: MeetingUpdate) -> CoreResult<Meeting> {
    let mut items = list(root)?;
    let item = items
        .iter_mut()
        .find(|m| m.id == id)
        .ok_or_else(|| CoreError::NotFound(format!("meeting {id}")))?;

    if let Some(status) = updates.status {
        item.status = status;
    }
    if let Some(title) = updates.title {
        item.title = title;
    }
    if let Some(bot_name) = updates.bot_name {
        item.bot_name = Some(bot_name);
    }
    if let Some(participants) = updates.participants {
        item.participants = participants;
    }
    if let Some(count) = updates.caption_count {
        item.caption_count = count;
    }
    if let Some(count) = updates.action_items_count {
        item.action_items_count = count;
    }
    if let Some(ready) = updates.summary_ready {
        item.summary_ready = ready;
    }
    if let Some(summary) = updates.summary {
        item.summary = Some(summary);
    }
    if let Some(msg) = updates.error_message {
        item.error_message = msg;
    }
    if let Some(ts) = updates.started_at {
        item.started_at = ts;
    }
    if let Some(ts) = updates.ended_at {
        item.ended_at = ts;
    }

    item.updated_at = Utc::now().to_rfc3339();
    let result = item.clone();
    write_json(root, FILE, &items)?;
    Ok(result)
}

pub fn delete(root: &Path, id: &str) -> CoreResult<()> {
    let mut items = list(root)?;
    let before = items.len();
    items.retain(|m| m.id != id);
    if items.len() == before {
        return Err(CoreError::NotFound(format!("meeting {id}")));
    }
    write_json(root, FILE, &items)
}

// ── Caption ingestion ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptionLine {
    pub speaker: String,
    pub text: String,
    pub timestamp: Option<String>,
}

/// Path of the running transcript for a given meeting id.
fn transcript_rel(meeting_id: &str) -> String {
    format!(".houston/meetings/{meeting_id}/transcript.md")
}

/// Append deduplicated captions to the transcript and bump the meeting counts.
pub fn push_captions(root: &Path, meeting_id: &str, captions: &[CaptionLine]) -> CoreResult<Meeting> {
    with_json_file_lock(root, FILE, || {
        let mut items = list(root)?;
        let item = items
            .iter_mut()
            .find(|m| m.id == meeting_id)
            .ok_or_else(|| CoreError::NotFound(format!("meeting {meeting_id}")))?;

        let rel = transcript_rel(meeting_id);
        let existing = files::read_file(root, &rel)
            .map_err(|e| CoreError::Internal(format!("read transcript: {e}")))?;

        // Build dedup set from existing lines.
        let mut seen: HashSet<(String, String)> = existing
            .lines()
            .filter_map(parse_transcript_line)
            .collect();

        let mut append = String::new();
        let mut added: u32 = 0;
        let mut new_speakers: Vec<String> = Vec::new();

        for cap in captions {
            let key = (cap.speaker.clone(), cap.text.clone());
            if seen.contains(&key) {
                continue;
            }
            seen.insert(key);
            match &cap.timestamp {
                Some(ts) => append.push_str(&format!("**[{ts}] {}**: {}\n", cap.speaker, cap.text)),
                None => append.push_str(&format!("**{}**: {}\n", cap.speaker, cap.text)),
            }
            added += 1;
            if !item.participants.contains(&cap.speaker) && !new_speakers.contains(&cap.speaker) {
                new_speakers.push(cap.speaker.clone());
            }
        }

        if added == 0 {
            return Ok(item.clone());
        }

        let full = format!("{existing}{append}");
        files::write_file_atomic(root, &rel, &full)
            .map_err(|e| CoreError::Internal(format!("write transcript: {e}")))?;

        item.caption_count += added;
        item.participants.extend(new_speakers);
        item.updated_at = Utc::now().to_rfc3339();
        let result = item.clone();
        write_json(root, FILE, &items)?;
        Ok(result)
    })
}

/// Parse `**[ts] Speaker**: text` or `**Speaker**: text` → `(speaker, text)`.
fn parse_transcript_line(line: &str) -> Option<(String, String)> {
    let inner = line.strip_prefix("**")?;
    let sep = inner.find("**: ")?;
    let speaker_part = &inner[..sep];
    let text = inner[sep + 4..].to_string();
    let speaker = if speaker_part.starts_with('[') {
        let end = speaker_part.find("] ")?;
        speaker_part[end + 2..].to_string()
    } else {
        speaker_part.to_string()
    };
    Some((speaker, text))
}

// ── Lifecycle shortcuts ──────────────────────────────────────────────────────

pub fn get(root: &Path, id: &str) -> CoreResult<Meeting> {
    list(root)?
        .into_iter()
        .find(|m| m.id == id)
        .ok_or_else(|| CoreError::NotFound(format!("meeting {id}")))
}

pub fn start_meeting(root: &Path, meeting_id: &str) -> CoreResult<Meeting> {
    update(root, meeting_id, MeetingUpdate {
        status: Some(MeetingStatus::Live),
        started_at: Some(Some(Utc::now().to_rfc3339())),
        ..Default::default()
    })
}

pub fn end_meeting(root: &Path, meeting_id: &str) -> CoreResult<Meeting> {
    update(root, meeting_id, MeetingUpdate {
        status: Some(MeetingStatus::Processing),
        ended_at: Some(Some(Utc::now().to_rfc3339())),
        ..Default::default()
    })
}

// ── Post-processing ──────────────────────────────────────────────────────────

/// Directory that holds per-meeting files (transcript, summary, action_items).
pub fn meeting_dir(root: &Path, meeting_id: &str) -> PathBuf {
    root.join(".houston").join("meetings").join(meeting_id)
}

/// Read the running transcript for a meeting; returns "" if the file is missing.
pub fn read_transcript(root: &Path, meeting_id: &str) -> String {
    std::fs::read_to_string(meeting_dir(root, meeting_id).join("transcript.md"))
        .unwrap_or_default()
}

fn post_process_prompt(meeting: &Meeting, transcript: &str, root: &Path) -> String {
    let dir = meeting_dir(root, &meeting.id);
    let dir_str = dir.display();
    let title = &meeting.title;
    let bot = meeting.bot_name.as_deref().unwrap_or("Houston");
    let transcript_section = if transcript.trim().is_empty() {
        "(no transcript captured — the meeting may have been too short or captions were off)".to_string()
    } else {
        transcript.to_string()
    };
    format!(
        "You just finished a meeting as \"{bot}\".\n\
         Meeting title: \"{title}\"\n\n\
         Transcript:\n---\n{transcript_section}\n---\n\n\
         Using your file tools, please:\n\
         1. Write a concise summary (3-5 sentences: main topics, decisions, outcomes) \
            to the file: {dir_str}/summary.md\n\
         2. Write each action item on its own line (format: `- action item text`) \
            to: {dir_str}/action_items.md\n\n\
         After writing the files, respond briefly confirming what you found."
    )
}

/// Generate a quick in-meeting response to a direct question addressed to the bot.
///
/// Runs a focused, one-shot agent session (no history) and returns the plain-text
/// reply so the caller can inject it into the Meet chat. Times out if the underlying
/// session never returns a result.
pub async fn respond_in_meeting(
    root: PathBuf,
    agent_path: String,
    meeting: Meeting,
    question: String,
    recent_transcript: String,
    events: DynEventSink,
) -> CoreResult<String> {
    let bot = meeting.bot_name.as_deref().unwrap_or("Houston");
    let context_section = meeting
        .context
        .as_deref()
        .map(|c| format!("Meeting context: {c}\n\n"))
        .unwrap_or_default();
    let transcript_section = if recent_transcript.trim().is_empty() {
        String::new()
    } else {
        format!("Recent conversation:\n{recent_transcript}\n\n")
    };
    let prompt = format!(
        "You are {bot}, an AI assistant participating live in the meeting \"{title}\".\n\
         {context_section}\
         A participant just addressed you: \"{question}\"\n\n\
         {transcript_section}\
         Respond naturally as if you are speaking in the meeting right now. \
         Keep your reply to 1-3 sentences maximum. \
         Be concise, direct, and conversational. \
         Plain text only — no markdown formatting.",
        title = meeting.title,
    );

    let session_key = format!("meeting-respond-{}-{}", meeting.id, Uuid::new_v4());
    let resolved = crate::sessions::resolve_provider(&root);
    let effort = crate::sessions::resolve_effort(&root, resolved.provider);

    let handle = session_runner::spawn_and_monitor(
        events,
        agent_path,
        session_key,
        prompt,
        None,
        None,
        root,
        None,
        None,
        None,
        None,
        resolved.provider,
        resolved.model,
        effort,
    );

    let result = handle
        .await
        .map_err(|e| CoreError::Internal(format!("respond task panicked: {e}")))?;

    if let Some(err) = result.error {
        return Err(CoreError::Internal(format!("respond session error: {err}")));
    }

    Ok(result.response_text.unwrap_or_default())
}

/// Launch post-processing for a meeting that just ended.
///
/// Spawns an agent session that reads the transcript and writes `summary.md` +
/// `action_items.md` into the meeting directory. Updates the meeting record and
/// emits events when done. Call with `tokio::spawn`.
pub async fn post_process_meeting(
    root: PathBuf,
    agent_path: String,
    meeting: Meeting,
    events: DynEventSink,
) {
    let transcript = read_transcript(&root, &meeting.id);
    let prompt = post_process_prompt(&meeting, &transcript, &root);
    let session_key = format!("meeting-post-{}", meeting.id);

    let resolved = crate::sessions::resolve_provider(&root);
    let effort = crate::sessions::resolve_effort(&root, resolved.provider);

    let handle = session_runner::spawn_and_monitor(
        events.clone(),
        agent_path.clone(),
        session_key,
        prompt,
        None,
        None,
        root.clone(),
        None,
        None,
        None,
        None,
        resolved.provider,
        resolved.model,
        effort,
    );

    let fail = |msg: String| {
        tracing::error!("[meetings] post-process failed for {}: {msg}", meeting.id);
        if let Err(e) = update(
            &root,
            &meeting.id,
            MeetingUpdate {
                status: Some(MeetingStatus::Error),
                error_message: Some(Some(msg)),
                ..Default::default()
            },
        ) {
            tracing::error!("[meetings] could not write error status: {e}");
        }
        events.emit(HoustonEvent::MeetingStatusChanged {
            agent_path: agent_path.clone(),
            meeting_id: meeting.id.clone(),
            status: MeetingStatus::Error.to_string(),
        });
        events.emit(HoustonEvent::MeetingChanged {
            agent_path: agent_path.clone(),
            meeting_id: meeting.id.clone(),
        });
    };

    let result = match handle.await {
        Ok(r) => r,
        Err(e) => { fail(format!("session task panicked: {e}")); return; }
    };

    if let Some(err) = result.error {
        fail(err);
        return;
    }

    let dir = meeting_dir(&root, &meeting.id);
    let summary = std::fs::read_to_string(dir.join("summary.md"))
        .ok()
        .filter(|s| !s.trim().is_empty())
        .or(result.response_text);

    let action_items_count = std::fs::read_to_string(dir.join("action_items.md"))
        .unwrap_or_default()
        .lines()
        .filter(|l| l.trim_start().starts_with("- "))
        .count() as u32;

    if let Err(e) = update(
        &root,
        &meeting.id,
        MeetingUpdate {
            status: Some(MeetingStatus::Completed),
            summary_ready: Some(true),
            summary,
            action_items_count: Some(action_items_count),
            ..Default::default()
        },
    ) {
        tracing::error!("[meetings] could not write completed status: {e}");
    }

    events.emit(HoustonEvent::MeetingStatusChanged {
        agent_path: agent_path.clone(),
        meeting_id: meeting.id.clone(),
        status: MeetingStatus::Completed.to_string(),
    });
    events.emit(HoustonEvent::MeetingChanged { agent_path, meeting_id: meeting.id });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn meeting_status_display_roundtrip() {
        for (status, s) in [
            (MeetingStatus::Upcoming, "upcoming"),
            (MeetingStatus::Live, "live"),
            (MeetingStatus::Processing, "processing"),
            (MeetingStatus::Completed, "completed"),
            (MeetingStatus::Error, "error"),
        ] {
            assert_eq!(status.to_string(), s);
            assert_eq!(MeetingStatus::from_str(s).unwrap(), status);
        }
    }

    #[test]
    fn meeting_status_from_str_rejects_unknown() {
        assert!(MeetingStatus::from_str("unknown").is_err());
    }

    #[test]
    fn crud_lifecycle() {
        let dir = tempfile::TempDir::new().unwrap();
        assert!(list(dir.path()).unwrap().is_empty());

        let m = create(
            dir.path(),
            NewMeeting {
                title: "Weekly Sync".into(),
                meet_url: "https://meet.google.com/abc-def-ghi".into(),
                bot_name: Some("Houston".into()),
                status: None,
                context: Some("Discuss roadmap".into()),
                scheduled_at: None,
            },
        )
        .unwrap();

        assert_eq!(m.title, "Weekly Sync");
        assert_eq!(m.status, MeetingStatus::Upcoming);
        assert_eq!(list(dir.path()).unwrap().len(), 1);

        let updated = update(
            dir.path(),
            &m.id,
            MeetingUpdate {
                status: Some(MeetingStatus::Live),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(updated.status, MeetingStatus::Live);

        delete(dir.path(), &m.id).unwrap();
        assert!(list(dir.path()).unwrap().is_empty());
    }

    #[test]
    fn update_not_found_returns_error() {
        let dir = tempfile::TempDir::new().unwrap();
        let result = update(
            dir.path(),
            "nonexistent",
            MeetingUpdate {
                status: Some(MeetingStatus::Completed),
                ..Default::default()
            },
        );
        assert!(result.is_err());
    }

    #[test]
    fn delete_not_found_returns_error() {
        let dir = tempfile::TempDir::new().unwrap();
        assert!(delete(dir.path(), "nonexistent").is_err());
    }

    #[test]
    fn caption_count_increments() {
        let dir = tempfile::TempDir::new().unwrap();
        let m = create(
            dir.path(),
            NewMeeting {
                title: "Demo".into(),
                meet_url: "https://meet.google.com/zzz-zzz-zzz".into(),
                bot_name: None,
                status: Some(MeetingStatus::Live),
                context: None,
                scheduled_at: None,
            },
        )
        .unwrap();

        let updated = update(
            dir.path(),
            &m.id,
            MeetingUpdate {
                caption_count: Some(42),
                participants: Some(vec!["Alice".into(), "Bob".into()]),
                ..Default::default()
            },
        )
        .unwrap();

        assert_eq!(updated.caption_count, 42);
        assert_eq!(updated.participants, vec!["Alice", "Bob"]);
    }

    #[test]
    fn nullable_fields_can_be_set_and_cleared() {
        let dir = tempfile::TempDir::new().unwrap();
        let m = create(
            dir.path(),
            NewMeeting {
                title: "T".into(),
                meet_url: "https://meet.google.com/t-t-t".into(),
                bot_name: None,
                status: None,
                context: None,
                scheduled_at: None,
            },
        )
        .unwrap();

        let set = update(
            dir.path(),
            &m.id,
            MeetingUpdate {
                error_message: Some(Some("TTS failed".into())),
                started_at: Some(Some("2026-06-06T10:00:00Z".into())),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(set.error_message.as_deref(), Some("TTS failed"));
        assert!(set.started_at.is_some());

        let cleared = update(
            dir.path(),
            &m.id,
            MeetingUpdate {
                error_message: Some(None),
                ..Default::default()
            },
        )
        .unwrap();
        assert!(cleared.error_message.is_none());
    }

    #[test]
    fn push_captions_appends_and_deduplicates() {
        let dir = tempfile::TempDir::new().unwrap();
        let m = create(
            dir.path(),
            NewMeeting {
                title: "Caption Test".into(),
                meet_url: "https://meet.google.com/cap-cap-cap".into(),
                bot_name: None,
                status: Some(MeetingStatus::Live),
                context: None,
                scheduled_at: None,
            },
        )
        .unwrap();

        let lines = vec![
            CaptionLine { speaker: "Alice".into(), text: "Hello everyone".into(), timestamp: None },
            CaptionLine { speaker: "Bob".into(), text: "Hi Alice".into(), timestamp: Some("00:01".into()) },
        ];
        let updated = push_captions(dir.path(), &m.id, &lines).unwrap();
        assert_eq!(updated.caption_count, 2);
        assert!(updated.participants.contains(&"Alice".to_string()));
        assert!(updated.participants.contains(&"Bob".to_string()));

        // Re-sending the same captions must not duplicate.
        let updated2 = push_captions(dir.path(), &m.id, &lines).unwrap();
        assert_eq!(updated2.caption_count, 2);

        // New caption increments count.
        let new_line = vec![CaptionLine { speaker: "Alice".into(), text: "Good point".into(), timestamp: None }];
        let updated3 = push_captions(dir.path(), &m.id, &new_line).unwrap();
        assert_eq!(updated3.caption_count, 3);
    }

    #[test]
    fn start_and_end_meeting_transitions() {
        let dir = tempfile::TempDir::new().unwrap();
        let m = create(
            dir.path(),
            NewMeeting {
                title: "Lifecycle Test".into(),
                meet_url: "https://meet.google.com/life".into(),
                bot_name: None,
                status: None,
                context: None,
                scheduled_at: None,
            },
        )
        .unwrap();
        assert_eq!(m.status, MeetingStatus::Upcoming);

        let live = start_meeting(dir.path(), &m.id).unwrap();
        assert_eq!(live.status, MeetingStatus::Live);
        assert!(live.started_at.is_some());

        let processing = end_meeting(dir.path(), &m.id).unwrap();
        assert_eq!(processing.status, MeetingStatus::Processing);
        assert!(processing.ended_at.is_some());
    }

    #[test]
    fn parse_transcript_line_handles_both_formats() {
        let (s, t) = parse_transcript_line("**Alice**: Hello world").unwrap();
        assert_eq!(s, "Alice");
        assert_eq!(t, "Hello world");

        let (s2, t2) = parse_transcript_line("**[00:01:30] Bob**: Good morning").unwrap();
        assert_eq!(s2, "Bob");
        assert_eq!(t2, "Good morning");

        assert!(parse_transcript_line("plain text").is_none());
    }
}
