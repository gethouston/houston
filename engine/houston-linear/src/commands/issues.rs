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
    Ok(lift_summary(summary))
}

// ── Workspace-many (PR D) variants ───────────────────────────────

/// List per-org issues from the workspace-level projection.
/// Read-only. Returns an empty vec for never-connected orgs.
pub fn list_issues_for_org(
    workspace_path: &Path,
    org_id: &str,
) -> Result<Vec<TrackerIssue>, LinearError> {
    crate::models::load_projection_for_workspace_org(workspace_path, org_id)
}

/// Trigger a per-org reconcile against Linear. Loads tokens from
/// keychain via the workspace-level `<org_id>.json` connection meta,
/// runs the cursor-based puller, writes raw + projection to the
/// per-org dir under the workspace.
pub async fn sync_now_for_org(
    workspace_path: &Path,
    org_id: &str,
) -> Result<TrackerReconcileResponse, LinearError> {
    let _meta = ConnectionMeta::load_for_workspace_org(workspace_path, org_id)?;
    let tokens = crate::keychain::load(org_id)?;
    let summary = crate::reconcile::reconcile_issues_for_org(
        workspace_path,
        org_id,
        super::task::http(),
        &tokens.access_token,
    )
    .await?;
    Ok(lift_summary(summary))
}

fn lift_summary(summary: crate::reconcile::ReconcileSummary) -> TrackerReconcileResponse {
    match summary {
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
    }
}
