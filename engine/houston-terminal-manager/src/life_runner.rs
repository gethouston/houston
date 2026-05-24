//! Remote runner: drive a Houston session via the Life Runtime (`lifed`).
//!
//! Plugs into the [`crate::session_dispatch::SessionRunner`] trait shipped in
//! the H1 refactor. The [`LifeRemoteRunner`] connects to a `lifed` daemon
//! over a Unix Domain Socket via `houston_life::LifeClient`, creates a Life
//! session, sends the prompt, and translates streaming `AgentEvent`s back
//! into Houston [`SessionUpdate`]s on the channel.
//!
//! Stage 0 — assumes `lifed` runs locally with the dev signer
//! (`auth.dev_signer_enabled = true`). Connection params come from env
//! vars with safe defaults:
//!
//! - `LIFED_SOCK` — UDS path (default `/tmp/life/life.sock`)
//! - `LIFED_TOKEN` — bearer token (default `test-token-for-houston`)
//! - `LIFED_USER` — user_id field on `CreateSessionReq` (default `houston-test`)
//!
//! Stage 1 will swap UDS for `lifegw` HTTPS + Tier-1 JWT custody.

use crate::session_dispatch::{SessionRunner, SpawnFuture};
use crate::session_update::SessionUpdate;
use crate::types::{FeedItem, SessionStatus};
use crate::Provider;
use houston_life::proto::aios::v1 as aios_pb;
use houston_life::proto::life::v1::{AgentEvent, AgentEventKind, CreateSessionReq, SendMessageReq};
use houston_life::LifeClient;
use tokio::sync::mpsc;

const DEFAULT_SOCK: &str = "/tmp/life/life.sock";
const DEFAULT_TOKEN: &str = "test-token-for-houston";
const DEFAULT_USER: &str = "houston-test";

pub(crate) struct LifeRemoteRunner;

pub(crate) static LIFE_RUNNER: LifeRemoteRunner = LifeRemoteRunner;

impl SessionRunner for LifeRemoteRunner {
    #[allow(clippy::too_many_arguments)]
    fn spawn<'a>(
        &'a self,
        tx: &'a mpsc::UnboundedSender<SessionUpdate>,
        _provider: Provider,
        prompt: String,
        resume_session_id: Option<String>,
        _working_dir: Option<std::path::PathBuf>,
        _model: Option<String>,
        _effort: Option<String>,
        _system_prompt: Option<String>,
        _mcp_config: Option<std::path::PathBuf>,
        _disable_builtin_tools: bool,
        _disable_all_tools: bool,
    ) -> SpawnFuture<'a> {
        Box::pin(async move {
            if let Err(msg) = run_session(tx, prompt, resume_session_id).await {
                let _ = tx.send(SessionUpdate::Status(SessionStatus::Error(msg)));
            }
        })
    }
}

async fn run_session(
    tx: &mpsc::UnboundedSender<SessionUpdate>,
    prompt: String,
    resume_session_id: Option<String>,
) -> Result<(), String> {
    let sock = std::env::var("LIFED_SOCK").unwrap_or_else(|_| DEFAULT_SOCK.to_string());
    let token = std::env::var("LIFED_TOKEN").unwrap_or_else(|_| DEFAULT_TOKEN.to_string());
    let user = std::env::var("LIFED_USER").unwrap_or_else(|_| DEFAULT_USER.to_string());

    let client = LifeClient::connect_uds(sock, token)
        .await
        .map_err(|e| format!("lifed connect: {e}"))?;

    let _ = tx.send(SessionUpdate::Status(SessionStatus::Running));

    let resume_sid = resume_session_id.map(|value| aios_pb::SessionId { value });

    let create_req = client
        .authed_request(CreateSessionReq {
            user_id: user,
            project_id: "default-project".to_string(),
            label: "houston-session".to_string(),
            resume_sid,
            inherit_policy: None,
        })
        .map_err(|e| format!("authed_request(CreateSession): {e}"))?;

    let session = client
        .agent()
        .create_session(create_req)
        .await
        .map_err(|e| format!("CreateSession: {e}"))?
        .into_inner();

    let sid = session
        .sid
        .ok_or_else(|| "CreateSession returned no sid".to_string())?;
    let _ = tx.send(SessionUpdate::SessionId(sid.value.clone()));

    let send_req = client
        .authed_request(SendMessageReq {
            sid: Some(sid),
            content: prompt,
            attachment_blob_ref: Vec::new(),
        })
        .map_err(|e| format!("authed_request(SendMessage): {e}"))?;

    let mut stream = client
        .agent()
        .send_message(send_req)
        .await
        .map_err(|e| format!("SendMessage: {e}"))?
        .into_inner();

    while let Some(event) = stream
        .message()
        .await
        .map_err(|e| format!("AgentEvent stream: {e}"))?
    {
        translate_and_emit(tx, event);
    }

    // Server closed the stream without an explicit FINISH frame; surface
    // a Completed status so consumers don't hang waiting for a terminal.
    let _ = tx.send(SessionUpdate::Status(SessionStatus::Completed));
    Ok(())
}

fn translate_and_emit(tx: &mpsc::UnboundedSender<SessionUpdate>, event: AgentEvent) {
    let kind = match AgentEventKind::try_from(event.kind) {
        Ok(k) => k,
        Err(_) => AgentEventKind::Unspecified,
    };
    let record = event.record.unwrap_or_default();
    let payload_str = String::from_utf8_lossy(&record.payload).into_owned();

    match kind {
        AgentEventKind::Token => {
            let _ = tx.send(SessionUpdate::Feed(FeedItem::AssistantTextStreaming(
                payload_str,
            )));
        }
        AgentEventKind::ToolCallPending => {
            let input = serde_json::from_str(&payload_str)
                .unwrap_or_else(|_| serde_json::Value::String(payload_str.clone()));
            let _ = tx.send(SessionUpdate::Feed(FeedItem::ToolCall {
                name: record.kind,
                input,
                tool_use_id: None,
            }));
        }
        AgentEventKind::ToolResult => {
            let _ = tx.send(SessionUpdate::Feed(FeedItem::ToolResult {
                content: payload_str,
                is_error: false,
                tool_use_id: None,
            }));
        }
        AgentEventKind::ApprovalRequired => {
            // Houston has no review-queue UI yet (the spec flags this as
            // a Stage-1 follow-up). Surface as a SystemMessage so the
            // session feed still shows that a gate fired.
            let _ = tx.send(SessionUpdate::Feed(FeedItem::SystemMessage(format!(
                "approval required: {payload_str}"
            ))));
        }
        AgentEventKind::Finish => {
            let _ = tx.send(SessionUpdate::Status(SessionStatus::Completed));
        }
        AgentEventKind::Error => {
            let _ = tx.send(SessionUpdate::Status(SessionStatus::Error(payload_str)));
        }
        AgentEventKind::Hibernate => {
            let _ = tx.send(SessionUpdate::Feed(FeedItem::SystemMessage(
                "hibernate".to_string(),
            )));
        }
        AgentEventKind::Unspecified => {
            // No-op — zero/unknown variant. The server should never emit
            // UNSPECIFIED in a well-formed stream; if it does, dropping
            // is safer than fabricating a feed item.
        }
    }
}
