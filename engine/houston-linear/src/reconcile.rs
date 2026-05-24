//! Polling reconciliation — backstop for missed webhook deliveries.
//!
//! Drives an `updatedAt > cursor` paginated puller against Linear's
//! `issues` query. Each issue's raw payload writes to
//! `raw/issues/<uuid>.json`; the projection (matching
//! `tracker_issue.schema.json`) re-builds from raw at the end of every
//! run so the on-disk shape stays consistent with what subsequent
//! consumers (board card, agent shell tab) expect.
//!
//! ## Cursor semantics
//!
//! [`crate::SyncState::issues_cursor`] holds the RFC 3339 timestamp
//! of the latest `updatedAt` observed across all completed runs.
//! Subsequent runs filter on `updatedAt > cursor` and never re-fetch
//! work already processed. On the very first run the cursor is `None`,
//! so we omit the filter and pull the workspace's full issue history.
//!
//! ## Concurrency
//!
//! `sync_state.in_flight` guards the workspace from concurrent runs.
//! A second call while a run is in flight returns
//! [`ReconcileSummary::Skipped`] without touching state. The flag is
//! cleared on both success and failure paths so a crashed run doesn't
//! permanently lock the workspace.
//!
//! ## Pagination cap
//!
//! Hard cap of 200 pages per run (200 × 50 = 10_000 issues). Beyond
//! that the reconciler stops and lets the next scheduled run continue
//! from the updated cursor — prevents a single reconcile from
//! monopolizing the engine for hours on a backlog catch-up.

use crate::error::LinearError;
use crate::models;
use crate::queries::issues;
use crate::sync_state::SyncState;
use serde::{Deserialize, Serialize};
use std::path::Path;

const PAGE_SIZE: i32 = 50;
const MAX_PAGES_PER_RUN: usize = 200;

/// Outcome of a reconcile invocation. Returned to the caller for UI
/// feedback + telemetry.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case", tag = "kind")]
pub enum ReconcileSummary {
    Synced {
        issues_seen: usize,
        pages_fetched: usize,
        cursor_advanced_to: Option<String>,
    },
    Skipped {
        reason: String,
    },
}

/// Run a full issues reconcile against Linear.
///
/// Loads `sync_state.json`, fetches paginated issues, writes raw +
/// updates projection, persists cursor + last_reconcile_at.
pub async fn reconcile_issues(
    workspace_path: &Path,
    http: &reqwest::Client,
    access_token: &str,
) -> Result<ReconcileSummary, LinearError> {
    let mut state = SyncState::load(workspace_path)?;
    if state.in_flight {
        return Ok(ReconcileSummary::Skipped {
            reason: "another reconcile is already in flight".into(),
        });
    }
    state.in_flight = true;
    state.save_atomic(workspace_path)?;

    // Wrap the work so we ALWAYS clear in_flight on the way out
    // (even on error). Mirrors a try/finally.
    let result = run_inner(
        workspace_path,
        http,
        access_token,
        state.issues_cursor.clone(),
    )
    .await;

    // Reload — run_inner may have updated state between snapshot and now.
    let mut final_state = SyncState::load(workspace_path).unwrap_or(state);
    final_state.in_flight = false;
    final_state.last_reconcile_at = Some(chrono::Utc::now().to_rfc3339());
    match &result {
        Ok(ReconcileSummary::Synced {
            cursor_advanced_to, ..
        }) => {
            if let Some(c) = cursor_advanced_to {
                final_state.advance_issues_cursor(c);
            }
            final_state.last_error = None;
        }
        Ok(ReconcileSummary::Skipped { .. }) => { /* leave error alone */ }
        Err(e) => {
            final_state.last_error = Some(format!("{e}"));
        }
    }
    final_state.save_atomic(workspace_path)?;
    result
}

// ── Workspace-many (PR D) reconcile variant ─────────────────────
//
// Parallel implementation that reads/writes the per-(workspace, org)
// data dir introduced by PR A's `connection::org_data_dir`. Same
// cursor / pagination / in_flight semantics as the per-agent
// `reconcile_issues` above; PR E retires the legacy after soak.

/// Run a full issues reconcile against Linear for a specific
/// `(workspace_path, org_id)` pair. Writes raw + projection under
/// `<workspace>/.houston/trackers/linear/<org_id>/`.
pub async fn reconcile_issues_for_org(
    workspace_path: &Path,
    org_id: &str,
    http: &reqwest::Client,
    access_token: &str,
) -> Result<ReconcileSummary, LinearError> {
    let mut state = SyncState::load_for_workspace_org(workspace_path, org_id)?;
    if state.in_flight {
        return Ok(ReconcileSummary::Skipped {
            reason: "another reconcile is already in flight".into(),
        });
    }
    state.in_flight = true;
    state.save_atomic_for_workspace_org(workspace_path, org_id)?;

    let result = run_inner_for_org(
        workspace_path,
        org_id,
        http,
        access_token,
        state.issues_cursor.clone(),
    )
    .await;

    let mut final_state =
        SyncState::load_for_workspace_org(workspace_path, org_id).unwrap_or(state);
    final_state.in_flight = false;
    final_state.last_reconcile_at = Some(chrono::Utc::now().to_rfc3339());
    match &result {
        Ok(ReconcileSummary::Synced {
            cursor_advanced_to, ..
        }) => {
            if let Some(c) = cursor_advanced_to {
                final_state.advance_issues_cursor(c);
            }
            final_state.last_error = None;
        }
        Ok(ReconcileSummary::Skipped { .. }) => { /* leave error alone */ }
        Err(e) => {
            final_state.last_error = Some(format!("{e}"));
        }
    }
    final_state.save_atomic_for_workspace_org(workspace_path, org_id)?;
    result
}

async fn run_inner_for_org(
    workspace_path: &Path,
    org_id: &str,
    http: &reqwest::Client,
    access_token: &str,
    cursor: Option<String>,
) -> Result<ReconcileSummary, LinearError> {
    let mut after: Option<String> = None;
    let mut total: usize = 0;
    let mut pages: usize = 0;
    let mut max_updated_at: Option<String> = cursor.clone();

    loop {
        let page = issues::fetch_page(
            http,
            access_token,
            cursor.as_deref(),
            after.as_deref(),
            PAGE_SIZE,
        )
        .await?;

        for node in &page.nodes {
            models::write_raw_issue_for_workspace_org(workspace_path, org_id, node)?;
            let updated = &node.updated_at.0;
            if max_updated_at
                .as_deref()
                .map(|cur| updated.as_str() > cur)
                .unwrap_or(true)
            {
                max_updated_at = Some(updated.clone());
            }
            total += 1;
        }
        pages += 1;

        if !page.page_info.has_next_page || pages >= MAX_PAGES_PER_RUN {
            break;
        }
        after = page.page_info.end_cursor.clone();
    }

    models::reproject_issues_from_raw_for_workspace_org(workspace_path, org_id)?;

    Ok(ReconcileSummary::Synced {
        issues_seen: total,
        pages_fetched: pages,
        cursor_advanced_to: max_updated_at,
    })
}

async fn run_inner(
    workspace_path: &Path,
    http: &reqwest::Client,
    access_token: &str,
    cursor: Option<String>,
) -> Result<ReconcileSummary, LinearError> {
    let mut after: Option<String> = None;
    let mut total: usize = 0;
    let mut pages: usize = 0;
    let mut max_updated_at: Option<String> = cursor.clone();

    loop {
        let page = issues::fetch_page(
            http,
            access_token,
            cursor.as_deref(),
            after.as_deref(),
            PAGE_SIZE,
        )
        .await?;

        for node in &page.nodes {
            models::write_raw_issue(workspace_path, node)?;
            // Track the latest updatedAt we've actually seen so the
            // cursor advances correctly even if Linear returned an
            // unordered page.
            let updated = &node.updated_at.0;
            if max_updated_at
                .as_deref()
                .map(|cur| updated.as_str() > cur)
                .unwrap_or(true)
            {
                max_updated_at = Some(updated.clone());
            }
            total += 1;
        }
        pages += 1;

        if !page.page_info.has_next_page || pages >= MAX_PAGES_PER_RUN {
            break;
        }
        after = page.page_info.end_cursor.clone();
    }

    // Re-project from raw — captures the full mirror, not just this
    // run's delta. Idempotent: subsequent runs that touch the same raw
    // files re-produce the same projection.
    models::reproject_issues_from_raw(workspace_path)?;

    Ok(ReconcileSummary::Synced {
        issues_seen: total,
        pages_fetched: pages,
        cursor_advanced_to: max_updated_at,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn in_flight_guard_blocks_concurrent_reconcile() {
        let dir = TempDir::new().unwrap();
        // Pre-set in_flight true.
        let s = SyncState {
            in_flight: true,
            ..SyncState::default()
        };
        s.save_atomic(dir.path()).unwrap();

        // Use a no-op HTTP client; the guard should short-circuit
        // before any HTTP call.
        let http = reqwest::Client::new();
        let rt = tokio::runtime::Runtime::new().unwrap();
        let summary = rt
            .block_on(reconcile_issues(dir.path(), &http, "token"))
            .unwrap();
        assert!(matches!(summary, ReconcileSummary::Skipped { .. }));
    }
}
