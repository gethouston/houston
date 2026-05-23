//! `viewer` query — fetches the current authenticated user + their
//! organization. Run once at the tail of the OAuth flow to populate
//! `connection.json` with `org_id`, `org_name`, and the Houston
//! AppUser id (when present).
//!
//! GraphQL:
//! ```graphql
//! query Viewer {
//!   viewer { id name email }
//!   organization { id name urlKey }
//! }
//! ```

use crate::connection::OrgInfo;
use crate::error::LinearError;
use cynic::{GraphQlResponse, QueryBuilder};

// Bring the cynic-generated DSL module into scope for the QueryFragment
// derives below. Lives in the parent module (`queries::schema`) via
// `#[cynic::schema("linear")] pub mod schema {}`.
#[allow(unused_imports)]
use super::schema;

#[derive(cynic::QueryFragment, Debug)]
#[cynic(schema = "linear", graphql_type = "Query")]
pub struct ViewerQuery {
    pub viewer: User,
    pub organization: Organization,
}

#[derive(cynic::QueryFragment, Debug)]
#[cynic(schema = "linear", graphql_type = "User")]
pub struct User {
    pub id: cynic::Id,
    pub name: String,
    pub email: String,
}

#[derive(cynic::QueryFragment, Debug)]
#[cynic(schema = "linear", graphql_type = "Organization")]
pub struct Organization {
    pub id: cynic::Id,
    pub name: String,
    pub url_key: String,
}

/// Execute the viewer query against Linear's GraphQL endpoint using
/// the caller-supplied access token. Returns an [`OrgInfo`] suitable
/// for `connection.json` population.
///
/// Manual JSON post (cynic 3 ReqwestExt trait method has been finicky
/// across versions; staying explicit keeps this resilient to cynic
/// crate upgrades). The query itself is still cynic-typed at compile
/// time via the [`ViewerQuery`] derive.
pub async fn fetch_org_info(
    http: &reqwest::Client,
    access_token: &str,
) -> Result<OrgInfo, LinearError> {
    let operation = ViewerQuery::build(());
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
            "viewer query HTTP {status}: {body}"
        )));
    }

    let parsed: GraphQlResponse<ViewerQuery> = response.json().await?;

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
        .ok_or_else(|| LinearError::SchemaDrift("viewer query returned no data".into()))?;

    Ok(OrgInfo {
        org_id: data.organization.id.into_inner(),
        org_name: data.organization.name,
        app_user_id: None, // AppUser-id flow lands in C4 (AgentSession registration).
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn viewer_query_compiles_against_vendored_schema() {
        // Build the query at compile-time-checked types. cynic enforces
        // schema conformance via the QueryFragment derive macros; if
        // the schema drifts in a way that breaks this query, the build
        // breaks. This test exercises the build path at runtime to
        // catch any panic-on-construction surprises in the macro
        // expansion.
        let op = ViewerQuery::build(());
        let body = serde_json::to_string(&op).unwrap();
        assert!(body.contains("viewer"));
        assert!(body.contains("organization"));
        assert!(body.contains("urlKey"));
    }
}
