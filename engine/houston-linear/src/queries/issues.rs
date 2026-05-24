//! Paginated issue fetcher — incremental sync via `updatedAt` cursor.
//!
//! Reconciler drives this with `filter.updated_at.gt = sync_state.issues_cursor`
//! so subsequent runs do only delta work. Initial sync omits the filter.
//! Projection of [`IssueNode`] to disk lives in [`crate::models`].

use crate::error::LinearError;
use cynic::{GraphQlResponse, QueryBuilder};

// Bring the cynic-generated DSL module + the custom-scalar wrappers
// into scope. Wrappers are declared in the parent `queries.rs` so the
// derive resolution finds the schema module alongside them.
#[allow(unused_imports)]
use super::{schema, DateTime, DateTimeOrDuration};

// ── Input objects ────────────────────────────────────────────────

#[derive(cynic::InputObject, Debug, Clone, Default)]
#[cynic(schema = "linear", graphql_type = "IssueFilter")]
pub struct IssueFilter {
    #[cynic(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<DateComparator>,
}

#[derive(cynic::InputObject, Debug, Clone, Default)]
#[cynic(schema = "linear", graphql_type = "DateComparator")]
pub struct DateComparator {
    /// Linear's `DateTimeOrDuration` scalar — wire shape is a JSON
    /// string (ISO 8601 RFC 3339 for absolute timestamps, or an ISO
    /// 8601 duration). The reconciler always passes the absolute
    /// form derived from the last-seen `updatedAt`.
    #[cynic(skip_serializing_if = "Option::is_none")]
    pub gt: Option<DateTimeOrDuration>,
}

#[derive(cynic::QueryVariables, Debug)]
pub struct IssuesVars {
    pub filter: Option<IssueFilter>,
    pub first: Option<i32>,
    pub after: Option<String>,
}

// ── Query + result shape ─────────────────────────────────────────

#[derive(cynic::QueryFragment, Debug)]
#[cynic(schema = "linear", graphql_type = "Query", variables = "IssuesVars")]
pub struct IssuesQuery {
    #[arguments(filter: $filter, first: $first, after: $after)]
    pub issues: IssueConnection,
}

#[derive(cynic::QueryFragment, Debug)]
#[cynic(schema = "linear", graphql_type = "IssueConnection")]
pub struct IssueConnection {
    pub nodes: Vec<IssueNode>,
    pub page_info: PageInfo,
}

#[derive(cynic::QueryFragment, Debug)]
#[cynic(schema = "linear", graphql_type = "PageInfo")]
pub struct PageInfo {
    pub has_next_page: bool,
    pub end_cursor: Option<String>,
}

#[derive(cynic::QueryFragment, Debug, Clone)]
#[cynic(schema = "linear", graphql_type = "Issue")]
pub struct IssueNode {
    pub id: cynic::Id,
    pub identifier: String,
    pub title: String,
    pub description: Option<String>,
    pub priority: f64,
    pub estimate: Option<f64>,
    pub url: String,
    pub created_at: DateTime,
    pub updated_at: DateTime,
    pub completed_at: Option<DateTime>,
    pub label_ids: Vec<String>,
    pub state: WorkflowStateRef,
    pub team: TeamRef,
    pub cycle: Option<CycleRef>,
    pub project: Option<ProjectRef>,
    pub project_milestone: Option<ProjectMilestoneRef>,
    pub parent: Option<IssueRef>,
    pub assignee: Option<UserRef>,
}

#[derive(cynic::QueryFragment, Debug, Clone)]
#[cynic(schema = "linear", graphql_type = "WorkflowState")]
pub struct WorkflowStateRef {
    pub id: cynic::Id,
    pub name: String,
    /// Linear's WorkflowStateType enum stringified: `triage` | `backlog` |
    /// `unstarted` | `started` | `completed` | `canceled`.
    #[cynic(rename = "type")]
    pub type_: String,
}

#[derive(cynic::QueryFragment, Debug, Clone)]
#[cynic(schema = "linear", graphql_type = "Team")]
pub struct TeamRef {
    pub id: cynic::Id,
}

#[derive(cynic::QueryFragment, Debug, Clone)]
#[cynic(schema = "linear", graphql_type = "Cycle")]
pub struct CycleRef {
    pub id: cynic::Id,
}

#[derive(cynic::QueryFragment, Debug, Clone)]
#[cynic(schema = "linear", graphql_type = "Project")]
pub struct ProjectRef {
    pub id: cynic::Id,
}

#[derive(cynic::QueryFragment, Debug, Clone)]
#[cynic(schema = "linear", graphql_type = "ProjectMilestone")]
pub struct ProjectMilestoneRef {
    pub id: cynic::Id,
}

#[derive(cynic::QueryFragment, Debug, Clone)]
#[cynic(schema = "linear", graphql_type = "Issue")]
pub struct IssueRef {
    pub id: cynic::Id,
}

#[derive(cynic::QueryFragment, Debug, Clone)]
#[cynic(schema = "linear", graphql_type = "User")]
pub struct UserRef {
    pub id: cynic::Id,
}

// Domain projection (`ProjectedIssue` + on-disk IO) lives in
// `crate::models`. Keeps this module focused on the cynic wire types.

// ── Network call ─────────────────────────────────────────────────

/// Fetch one page of issues from Linear, optionally filtered by
/// `updated_after` (RFC 3339).
///
/// `after` carries Relay-style page cursor when paginating within
/// a single sync; `updated_after` carries the time cursor that lets
/// subsequent reconciles do incremental work.
pub async fn fetch_page(
    http: &reqwest::Client,
    access_token: &str,
    updated_after: Option<&str>,
    after: Option<&str>,
    first: i32,
) -> Result<IssueConnection, LinearError> {
    let filter = updated_after.map(|cursor| IssueFilter {
        updated_at: Some(DateComparator {
            gt: Some(DateTimeOrDuration(cursor.to_string())),
        }),
    });

    let vars = IssuesVars {
        filter,
        first: Some(first),
        after: after.map(str::to_string),
    };
    let operation = IssuesQuery::build(vars);

    let response = http
        .post(crate::LINEAR_GRAPHQL_URL)
        .bearer_auth(access_token)
        .json(&operation)
        .send()
        .await?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(LinearError::Graphql(format!(
            "issues query HTTP {status}: {body}"
        )));
    }
    let parsed: GraphQlResponse<IssuesQuery> = response.json().await?;
    if let Some(errors) = parsed.errors {
        if !errors.is_empty() {
            let joined = errors
                .into_iter()
                .map(|e| e.message)
                .collect::<Vec<_>>()
                .join("; ");
            return Err(LinearError::Graphql(joined));
        }
    }
    let data = parsed
        .data
        .ok_or_else(|| LinearError::SchemaDrift("issues query returned no data".into()))?;
    Ok(data.issues)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn issues_query_compiles_against_vendored_schema() {
        // cynic-codegen validates QueryFragment derives at build time
        // against the vendored schema. This runtime check catches any
        // serialization-side surprises in the macro expansion.
        let vars = IssuesVars {
            filter: Some(IssueFilter {
                updated_at: Some(DateComparator {
                    gt: Some(DateTimeOrDuration("2026-05-23T00:00:00Z".into())),
                }),
            }),
            first: Some(50),
            after: None,
        };
        let op = IssuesQuery::build(vars);
        let body = serde_json::to_string(&op).unwrap();
        assert!(body.contains("issues"));
        assert!(body.contains("identifier"));
        assert!(body.contains("labelIds"));
        assert!(body.contains("pageInfo"));
    }
}
