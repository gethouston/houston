use std::str::FromStr;

use chrono::Utc;
use cron::Schedule;
use houston_events::{EventQueueHandle, HoustonInput};
use serde::{Deserialize, Serialize};
use tokio::sync::watch;
use tracing::{debug, error, info, warn};

/// Configuration for a single cron job.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CronJobConfig {
    pub id: String,
    pub name: String,
    /// Standard cron expression (6-field: sec min hour dom month dow).
    pub expression: String,
    /// Prompt text sent with each cron trigger.
    pub prompt: String,
    pub enabled: bool,
    pub project_id: Option<String>,
}

/// Runs a single cron job, computing next_run and sleeping until then.
pub struct CronRunner;

impl CronRunner {
    /// Spawn a cron job task that runs until `shutdown` is signalled.
    ///
    /// Returns `Err` if the cron expression cannot be parsed.
    pub fn spawn(
        config: CronJobConfig,
        queue_handle: EventQueueHandle,
        shutdown: watch::Receiver<bool>,
    ) -> anyhow::Result<tokio::task::JoinHandle<()>> {
        // Validate the expression eagerly so callers get a clear error.
        Schedule::from_str(&config.expression).map_err(|e| {
            anyhow::anyhow!("Invalid cron expression '{}': {}", config.expression, e)
        })?;

        let handle = tokio::spawn(async move {
            Self::run(config, queue_handle, shutdown).await;
        });

        Ok(handle)
    }

    async fn run(
        config: CronJobConfig,
        queue_handle: EventQueueHandle,
        mut shutdown: watch::Receiver<bool>,
    ) {
        if !config.enabled {
            info!(cron_id = %config.id, "Cron job disabled, not running");
            return;
        }

        let schedule = match Schedule::from_str(&config.expression) {
            Ok(s) => s,
            Err(e) => {
                error!(
                    cron_id = %config.id,
                    expression = %config.expression,
                    error = %e,
                    "Failed to parse cron expression"
                );
                return;
            }
        };

        info!(
            cron_id = %config.id,
            name = %config.name,
            expression = %config.expression,
            "Cron runner started"
        );

        loop {
            let next = match schedule.upcoming(Utc).next() {
                Some(t) => t,
                None => {
                    warn!(cron_id = %config.id, "No future occurrences, stopping");
                    return;
                }
            };

            let now = Utc::now();
            let delay = next.signed_duration_since(now);
            let sleep_duration = if delay.num_milliseconds() > 0 {
                std::time::Duration::from_millis(delay.num_milliseconds() as u64)
            } else {
                std::time::Duration::from_millis(0)
            };

            debug!(
                cron_id = %config.id,
                next = %next,
                sleep_ms = sleep_duration.as_millis() as u64,
                "Sleeping until next cron trigger"
            );

            tokio::select! {
                _ = tokio::time::sleep(sleep_duration) => {}
                _ = shutdown.changed() => {
                    if *shutdown.borrow() {
                        info!(cron_id = %config.id, "Cron runner shutting down");
                        return;
                    }
                }
            }

            let mut input = HoustonInput::cron(&config.name, &config.prompt);
            if let Some(ref project_id) = config.project_id {
                input = input.with_project(project_id.clone());
            }

            if let Err(e) = queue_handle.push(input) {
                error!(
                    cron_id = %config.id,
                    error = %e,
                    "Failed to push cron input"
                );
                return;
            }

            debug!(cron_id = %config.id, "Cron job fired");
        }
    }
}
