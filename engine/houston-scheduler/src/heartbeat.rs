use std::time::Duration;

use chrono::Timelike;
use houston_events::{EventQueueHandle, HoustonInput};
use serde::{Deserialize, Serialize};
use tokio::sync::watch;
use tracing::{debug, info};

/// Configuration for a periodic heartbeat.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeartbeatConfig {
    /// How often to fire the heartbeat.
    pub interval: Duration,
    /// The prompt text sent with each heartbeat input.
    pub prompt: String,
    /// Optional active hours window (start_hour, end_hour) in UTC.
    /// Heartbeats are suppressed outside this window.
    pub active_hours: Option<(u32, u32)>,
    /// Token the agent returns when there is nothing to do.
    pub suppression_token: String,
    /// Optionally scope the heartbeat to a project.
    pub project_id: Option<String>,
}

impl Default for HeartbeatConfig {
    fn default() -> Self {
        Self {
            interval: Duration::from_secs(30 * 60), // 30 minutes
            prompt: "Check for anything that needs attention.".to_string(),
            active_hours: None,
            suppression_token: "heartbeat_ok".to_string(),
            project_id: None,
        }
    }
}

/// Runs a periodic heartbeat, pushing `HoustonInput::heartbeat` into the queue.
pub struct HeartbeatRunner;

impl HeartbeatRunner {
    /// Spawn a heartbeat task that runs until `shutdown` is signalled.
    ///
    /// Returns the `JoinHandle` for the spawned task.
    pub fn spawn(
        config: HeartbeatConfig,
        queue_handle: EventQueueHandle,
        shutdown: watch::Receiver<bool>,
    ) -> tokio::task::JoinHandle<()> {
        tokio::spawn(async move {
            Self::run(config, queue_handle, shutdown).await;
        })
    }

    async fn run(
        config: HeartbeatConfig,
        queue_handle: EventQueueHandle,
        mut shutdown: watch::Receiver<bool>,
    ) {
        info!(
            interval_secs = config.interval.as_secs(),
            "Heartbeat runner started"
        );

        loop {
            tokio::select! {
                _ = tokio::time::sleep(config.interval) => {}
                _ = shutdown.changed() => {
                    if *shutdown.borrow() {
                        info!("Heartbeat runner shutting down");
                        return;
                    }
                }
            }

            // Check active hours window.
            if let Some((start, end)) = config.active_hours {
                let hour = chrono::Utc::now().hour();
                let in_window = if start <= end {
                    hour >= start && hour < end
                } else {
                    // Wraps midnight, e.g. (22, 6)
                    hour >= start || hour < end
                };
                if !in_window {
                    debug!(
                        current_hour = hour,
                        start, end, "Outside active hours, skipping heartbeat"
                    );
                    continue;
                }
            }

            let mut input = HoustonInput::heartbeat(&config.prompt);
            if let Some(ref project_id) = config.project_id {
                input = input.with_project(project_id.clone());
            }

            if let Err(e) = queue_handle.push(input) {
                tracing::error!(error = %e, "Failed to push heartbeat input");
                // Queue is closed; stop the runner.
                return;
            }

            debug!("Heartbeat fired");
        }
    }
}
