use std::collections::HashMap;

use houston_events::EventQueueHandle;
use tokio::sync::watch;
use tracing::info;

use crate::cron_job::{CronJobConfig, CronRunner};
use crate::heartbeat::{HeartbeatConfig, HeartbeatRunner};

/// Manages all heartbeat and cron tasks, providing a unified start/stop API.
pub struct Scheduler {
    queue_handle: EventQueueHandle,
    heartbeats: HashMap<String, tokio::task::JoinHandle<()>>,
    crons: HashMap<String, tokio::task::JoinHandle<()>>,
    shutdown_tx: watch::Sender<bool>,
    shutdown_rx: watch::Receiver<bool>,
    next_heartbeat_id: u64,
}

impl Scheduler {
    pub fn new(queue_handle: EventQueueHandle) -> Self {
        let (shutdown_tx, shutdown_rx) = watch::channel(false);
        Self {
            queue_handle,
            heartbeats: HashMap::new(),
            crons: HashMap::new(),
            shutdown_tx,
            shutdown_rx,
            next_heartbeat_id: 0,
        }
    }

    /// Add a heartbeat. Returns a unique heartbeat ID.
    pub fn add_heartbeat(&mut self, config: HeartbeatConfig) -> String {
        let id = format!("heartbeat_{}", self.next_heartbeat_id);
        self.next_heartbeat_id += 1;

        let handle =
            HeartbeatRunner::spawn(config, self.queue_handle.clone(), self.shutdown_rx.clone());

        self.heartbeats.insert(id.clone(), handle);
        info!(heartbeat_id = %id, "Heartbeat added");
        id
    }

    /// Remove and abort a heartbeat by ID.
    pub fn remove_heartbeat(&mut self, id: &str) {
        if let Some(handle) = self.heartbeats.remove(id) {
            handle.abort();
            info!(heartbeat_id = %id, "Heartbeat removed");
        }
    }

    /// Add a cron job. Returns the cron job's ID on success.
    ///
    /// Returns an error if the cron expression is invalid.
    pub fn add_cron(&mut self, config: CronJobConfig) -> anyhow::Result<String> {
        let id = config.id.clone();

        let handle =
            CronRunner::spawn(config, self.queue_handle.clone(), self.shutdown_rx.clone())?;

        self.crons.insert(id.clone(), handle);
        info!(cron_id = %id, "Cron job added");
        Ok(id)
    }

    /// Remove and abort a cron job by ID.
    pub fn remove_cron(&mut self, id: &str) {
        if let Some(handle) = self.crons.remove(id) {
            handle.abort();
            info!(cron_id = %id, "Cron job removed");
        }
    }

    /// Signal all tasks to shut down gracefully, then await their completion.
    pub async fn shutdown(&mut self) {
        info!("Scheduler shutting down");

        // Signal all tasks.
        let _ = self.shutdown_tx.send(true);

        // Await heartbeats.
        for (id, handle) in self.heartbeats.drain() {
            let _ = handle.await;
            info!(heartbeat_id = %id, "Heartbeat stopped");
        }

        // Await crons.
        for (id, handle) in self.crons.drain() {
            let _ = handle.await;
            info!(cron_id = %id, "Cron job stopped");
        }

        info!("Scheduler shut down complete");
    }

    /// Number of active heartbeats.
    pub fn heartbeat_count(&self) -> usize {
        self.heartbeats.len()
    }

    /// Number of active cron jobs.
    pub fn cron_count(&self) -> usize {
        self.crons.len()
    }
}
