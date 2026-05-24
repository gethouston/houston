//! Issue-side transport-neutral API — read the projection +
//! trigger reconciles. Engine-server routes
//! (`/v1/trackers/:provider/{issues,sync}`) lift these.

use crate::connection::ConnectionMeta;
use crate::error::LinearError;
use houston_engine_protocol::{TrackerIssue, TrackerReconcileResponse};
use std::path::Path;

/// List issues from the on-disk projection. Read-only — no network,
/// no keychain. Returns an empty vec for never-connected workspaces
/// (the caller decides whether to surface that vs. NotAuthenticated).
pub fn list_issues(workspace_path: &Path) -> Result<Vec<TrackerIssue>, LinearError> {
    crate::models::load_projection(workspace_path)
}

/// Trigger a reconcile against Linear. Loads tokens from keychain via
/// the workspace's `connection.json`, runs the cursor-based puller,
/// writes raw + projection. Returns the run summary.
pub async fn sync_now(workspace_path: &Path) -> Result<TrackerReconcileResponse, LinearError> {
    let meta = ConnectionMeta::load(workspace_path)?;
    let tokens = crate::keychain::load(&meta.org_id)?;
    let summary = crate::reconcile::reconcile_issues(
        workspace_path,
        super::task::http(),
        &tokens.access_token,
    )
    .await?;
    Ok(match summary {
        crate::reconcile::ReconcileSummary::Synced {
            issues_seen,
            pages_fetched,
            cursor_advanced_to,
        } => TrackerReconcileResponse::Synced {
            issues_seen,
            pages_fetched,
            cursor_advanced_to,
        },
        crate::reconcile::ReconcileSummary::Skipped { reason } => {
            TrackerReconcileResponse::Skipped { reason }
        }
    })
}
