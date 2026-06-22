use std::str::FromStr;
use std::time::Duration;

use chrono::Utc;
use cron::Schedule;
use houston_events::{EventQueueHandle, HoustonInput};
use serde::{Deserialize, Serialize};
use tokio::sync::watch;
use tracing::{debug, error, info, warn};

/// Upper bound on a single sleep in the cron wait loop. `tokio::time::sleep`
/// waits on the monotonic clock, which macOS freezes while the machine is
/// asleep, so one long sleep undercounts wall-clock time by the suspend
/// duration and the job fires late or misses the day (HOU-541). Capping each
/// sleep makes the loop re-read the wall clock often enough to catch up within
/// `MAX_TICK` of a wake.
const MAX_TICK: Duration = Duration::from_secs(30);

/// How long to nap before re-checking a scheduled instant, or `None` when the
/// instant is due (`now`) or overdue (a suspend slept past it) and the job
/// should fire. The nap is capped at `max` so the wait loop re-reads the wall
/// clock often enough to survive a system suspend. Pure in `now`, so the timing
/// is unit-testable without real time passing.
fn wait_until(
    now: chrono::DateTime<Utc>,
    next: chrono::DateTime<Utc>,
    max: Duration,
) -> Option<Duration> {
    match next.signed_duration_since(now).to_std() {
        Ok(remaining) if !remaining.is_zero() => Some(remaining.min(max)),
        _ => None,
    }
}

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
        Schedule::from_str(&config.expression)
            .map_err(|e| anyhow::anyhow!("Invalid cron expression '{}': {}", config.expression, e))?;

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

        // The instant we're waiting to fire, re-armed after each fire. Held
        // across the wait (not recomputed mid-loop): `upcoming` is "strictly
        // after now", so recomputing once `now` reaches it would step right
        // over the instant we mean to fire.
        let mut next = match schedule.upcoming(Utc).next() {
            Some(t) => t,
            None => {
                warn!(cron_id = %config.id, "No future occurrences, stopping");
                return;
            }
        };

        loop {
            // Sleep toward `next` in capped chunks so a long wait can't outlast
            // a system suspend (see `MAX_TICK`); fire as soon as the wall clock
            // has reached or passed the instant.
            if let Some(nap) = wait_until(Utc::now(), next, MAX_TICK) {
                tokio::select! {
                    _ = tokio::time::sleep(nap) => {}
                    _ = shutdown.changed() => {
                        if *shutdown.borrow() {
                            info!(cron_id = %config.id, "Cron runner shutting down");
                            return;
                        }
                    }
                }
                continue;
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

            // Re-arm for the next future instant (see the comment above the
            // initial computation).
            next = match schedule.upcoming(Utc).next() {
                Some(t) => t,
                None => {
                    warn!(cron_id = %config.id, "No future occurrences, stopping");
                    return;
                }
            };
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    // `wait_until` is the suspend-safe core of the cron wait loop (HOU-541):
    // a fire that is a whole day out must still be waited for in capped naps,
    // and an instant the machine slept past must fire rather than be skipped.

    #[test]
    fn wait_until_caps_a_far_future_nap() {
        let now = Utc.with_ymd_and_hms(2026, 6, 19, 1, 0, 0).unwrap();
        let next = now + chrono::Duration::hours(23);
        assert_eq!(wait_until(now, next, MAX_TICK), Some(MAX_TICK));
    }

    #[test]
    fn wait_until_returns_exact_remainder_within_cap() {
        let now = Utc.with_ymd_and_hms(2026, 6, 19, 12, 59, 50).unwrap();
        let next = Utc.with_ymd_and_hms(2026, 6, 19, 13, 0, 0).unwrap();
        assert_eq!(wait_until(now, next, MAX_TICK), Some(Duration::from_secs(10)));
    }

    #[test]
    fn wait_until_fires_when_due() {
        let now = Utc.with_ymd_and_hms(2026, 6, 19, 13, 0, 0).unwrap();
        assert_eq!(wait_until(now, now, MAX_TICK), None);
    }

    #[test]
    fn wait_until_fires_when_overdue_after_suspend() {
        // Woke hours after the instant: catch up, don't skip.
        let next = Utc.with_ymd_and_hms(2026, 6, 19, 13, 0, 0).unwrap();
        let woke = next + chrono::Duration::hours(9);
        assert_eq!(wait_until(woke, next, MAX_TICK), None);
    }
}
