//! Composio connection state for workflow step pre-flight checks.

use crate::workflows::types::WorkflowConnectionBlocker;
use async_trait::async_trait;
use houston_composio::cli::{self, ComposioStatus};
use std::collections::HashSet;

#[async_trait]
pub trait ConnectionChecker: Send + Sync {
    async fn composio_signed_in(&self) -> bool;
    async fn connected_toolkits(&self) -> HashSet<String>;
}

pub struct ComposioConnectionChecker;

#[async_trait]
impl ConnectionChecker for ComposioConnectionChecker {
    async fn composio_signed_in(&self) -> bool {
        matches!(cli::status().await, ComposioStatus::Ok { .. })
    }

    async fn connected_toolkits(&self) -> HashSet<String> {
        cli::list_connected_toolkits()
            .await
            .into_iter()
            .map(|s| s.to_lowercase())
            .collect()
    }
}

/// First missing connection blocker for `toolkits`, if any.
pub fn missing_connection_blocker(
    signed_in: bool,
    connected: &HashSet<String>,
    toolkits: &[String],
) -> Option<WorkflowConnectionBlocker> {
    if toolkits.is_empty() {
        return None;
    }
    if !signed_in {
        return Some(WorkflowConnectionBlocker::ComposioSignin);
    }
    for toolkit in toolkits {
        if !connected.contains(toolkit) {
            return Some(WorkflowConnectionBlocker::ComposioToolkit {
                toolkit: toolkit.clone(),
            });
        }
    }
    None
}

#[cfg(test)]
pub(crate) struct FakeConnectionChecker {
    pub signed_in: bool,
    pub connected: HashSet<String>,
}

#[cfg(test)]
#[async_trait]
impl ConnectionChecker for FakeConnectionChecker {
    async fn composio_signed_in(&self) -> bool {
        self.signed_in
    }

    async fn connected_toolkits(&self) -> HashSet<String> {
        self.connected.clone()
    }
}
