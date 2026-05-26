mod format;
mod linear;
mod linear_graphql;
#[cfg(test)]
mod linear_tests;

use serde::Deserialize;

const LINEAR_API_URL: &str = "https://api.linear.app/graphql";
const DEFAULT_BUG_LABEL_NAME: &str = "User Bug";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BugReportPayload {
    pub(super) command: String,
    pub(super) error: String,
    pub(super) space_name: Option<String>,
    pub(super) workspace_name: Option<String>,
    pub(super) user_email: Option<String>,
    pub(super) timestamp: String,
    pub(super) app_version: String,
    pub(super) logs: BugReportLogs,
    /// Free-text feedback the user wrote, when reporting voluntarily via
    /// the "Send feedback" menu item (not present on the auto-generated
    /// path that fires from error toasts). Rendered at the top of the
    /// Linear issue so the engineer reads the user's own words before logs.
    #[serde(default)]
    pub(super) user_message: Option<String>,
}

#[derive(Debug, Deserialize)]
pub(super) struct BugReportLogs {
    pub(super) backend: String,
    pub(super) frontend: String,
}

struct LinearBugReportConfig {
    api_key: String,
    team_id: String,
    label_name: String,
}

#[tauri::command(rename_all = "snake_case")]
pub async fn report_bug(payload: BugReportPayload) -> Result<Option<String>, String> {
    let config = bug_report_config()?;

    linear::send_bug_report_to(
        LINEAR_API_URL,
        &config.api_key,
        &config.team_id,
        &config.label_name,
        &payload,
    )
    .await
}

fn bug_report_config() -> Result<LinearBugReportConfig, String> {
    let api_key = configured_value(
        std::env::var("LINEAR_API_KEY").ok(),
        option_env!("LINEAR_API_KEY"),
    );
    let team_id = configured_value(
        std::env::var("LINEAR_TEAM_ID").ok(),
        option_env!("LINEAR_TEAM_ID"),
    );

    let label_name = configured_value(
        std::env::var("LINEAR_BUG_LABEL_NAME").ok(),
        option_env!("LINEAR_BUG_LABEL_NAME"),
    )
    .unwrap_or_else(|| DEFAULT_BUG_LABEL_NAME.to_string());

    match (api_key, team_id) {
        (Some(api_key), Some(team_id)) => Ok(LinearBugReportConfig {
            api_key,
            team_id,
            label_name,
        }),
        (None, None) => Err(
            "Bug reporting not configured (missing LINEAR_API_KEY and LINEAR_TEAM_ID)".to_string(),
        ),
        (None, Some(_)) => Err("Bug reporting not configured (missing LINEAR_API_KEY)".to_string()),
        (Some(_), None) => Err("Bug reporting not configured (missing LINEAR_TEAM_ID)".to_string()),
    }
}

fn configured_value(runtime: Option<String>, compiled: Option<&'static str>) -> Option<String> {
    runtime
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or_else(|| {
            compiled
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        })
}

#[cfg(test)]
pub(super) fn sample_payload() -> BugReportPayload {
    BugReportPayload {
        command: "list_workspaces".to_string(),
        error: "Error: no workspace found\nsecond line".to_string(),
        space_name: Some("Mission Control".to_string()),
        workspace_name: Some("Houston".to_string()),
        user_email: Some("user@example.com".to_string()),
        timestamp: "2026-04-30T12:00:00.000Z".to_string(),
        app_version: "0.4.4".to_string(),
        logs: BugReportLogs {
            backend: "backend log line".to_string(),
            frontend: "frontend log line".to_string(),
        },
        user_message: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn configured_value_prefers_runtime_value() {
        let value = configured_value(Some(" runtime ".to_string()), Some("compiled"));
        assert_eq!(value.as_deref(), Some("runtime"));
    }

    #[test]
    fn configured_value_uses_compiled_fallback() {
        let value = configured_value(Some(" ".to_string()), Some(" compiled "));
        assert_eq!(value.as_deref(), Some("compiled"));
    }
}
