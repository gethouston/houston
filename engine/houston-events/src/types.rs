use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// The kind of input flowing through the event queue.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum InputType {
    Message,
    Heartbeat,
    Cron,
    Hook,
    Webhook,
    AgentMessage,
}

/// Where an input originated.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InputSource {
    /// Channel the input arrived on: "slack", "telegram", "desktop", "system", "webhook".
    pub channel: String,
    /// Identifies the specific source: channel ID, cron job name, hook name, etc.
    pub identifier: String,
}

/// Lifecycle events emitted by the system as hooks.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HookEvent {
    AppStarted,
    AppStopping,
    SessionStarted {
        session_key: String,
    },
    SessionCompleted {
        session_key: String,
    },
    SessionError {
        session_key: String,
        error: String,
    },
    RoutineTriggered {
        routine_id: String,
    },
    RoutineCompleted {
        routine_id: String,
    },
    Custom {
        name: String,
        data: serde_json::Value,
    },
}

/// A single input flowing through the event queue.
///
/// All inputs — user messages, heartbeats, cron triggers, hooks, webhooks,
/// and agent-to-agent messages — are represented as `HoustonInput`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HoustonInput {
    pub id: String,
    pub input_type: InputType,
    pub source: InputSource,
    pub payload: serde_json::Value,
    pub session_key: Option<String>,
    pub project_id: Option<String>,
    pub created_at: DateTime<Utc>,
}

impl HoustonInput {
    pub fn new(input_type: InputType, source: InputSource, payload: serde_json::Value) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            input_type,
            source,
            payload,
            session_key: None,
            project_id: None,
            created_at: Utc::now(),
        }
    }

    pub fn with_session(mut self, key: String) -> Self {
        self.session_key = Some(key);
        self
    }

    pub fn with_project(mut self, id: String) -> Self {
        self.project_id = Some(id);
        self
    }

    /// Convenience: create a user message input.
    pub fn message(channel: &str, identifier: &str, text: &str) -> Self {
        Self::new(
            InputType::Message,
            InputSource {
                channel: channel.to_string(),
                identifier: identifier.to_string(),
            },
            serde_json::json!({ "text": text }),
        )
    }

    /// Convenience: create a heartbeat input.
    pub fn heartbeat(prompt: &str) -> Self {
        Self::new(
            InputType::Heartbeat,
            InputSource {
                channel: "system".to_string(),
                identifier: "heartbeat".to_string(),
            },
            serde_json::json!({ "prompt": prompt }),
        )
    }

    /// Convenience: create a cron-triggered input.
    pub fn cron(job_name: &str, prompt: &str) -> Self {
        Self::new(
            InputType::Cron,
            InputSource {
                channel: "system".to_string(),
                identifier: job_name.to_string(),
            },
            serde_json::json!({ "prompt": prompt }),
        )
    }

    /// Convenience: create a lifecycle hook input.
    pub fn hook(event: HookEvent) -> Self {
        let payload = serde_json::to_value(&event).unwrap_or_default();
        Self::new(
            InputType::Hook,
            InputSource {
                channel: "system".to_string(),
                identifier: "hook".to_string(),
            },
            payload,
        )
    }

    /// Convenience: create a webhook input.
    pub fn webhook(endpoint: &str, payload: serde_json::Value) -> Self {
        Self::new(
            InputType::Webhook,
            InputSource {
                channel: "webhook".to_string(),
                identifier: endpoint.to_string(),
            },
            payload,
        )
    }

    /// Convenience: create an agent-to-agent message.
    pub fn agent_message(from_agent: &str, to_agent: &str, text: &str) -> Self {
        Self::new(
            InputType::AgentMessage,
            InputSource {
                channel: "agent".to_string(),
                identifier: from_agent.to_string(),
            },
            serde_json::json!({ "to": to_agent, "text": text }),
        )
    }
}
