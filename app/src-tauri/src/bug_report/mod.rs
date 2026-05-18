mod format;
mod github;
#[cfg(test)]
mod github_tests;
mod linear;
mod linear_graphql;
#[cfg(test)]
mod linear_tests;
#[cfg(test)]
mod test_support;

use serde::Deserialize;

const LINEAR_API_URL: &str = "https://api.linear.app/graphql";
const DEFAULT_BUG_LABEL_NAME: &str = "User Bug";

const GITHUB_API_BASE: &str = "https://api.github.com";
const GITHUB_REPO: &str = "gethouston/houston";
const GITHUB_LABEL: &str = "user-bug";

#[derive(Debug, Clone, Deserialize)]
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
}

// `Clone` is needed so we can hand a copy to the spawned GitHub mirror
// task without keeping the user's toast waiting on the await.
#[derive(Debug, Clone, Deserialize)]
pub(super) struct BugReportLogs {
    pub(super) backend: String,
    pub(super) frontend: String,
}

struct LinearConfig {
    api_key: String,
    team_id: String,
    label_name: String,
}

struct GithubConfig {
    token: String,
}

struct BugReportConfig {
    linear: LinearConfig,
    /// `None` when the GitHub mirror is unconfigured (dev builds without a
    /// token). Deliberately not an error: the mirror is best-effort and the
    /// authoritative Linear sink still runs.
    github: Option<GithubConfig>,
}

#[tauri::command(rename_all = "snake_case")]
pub async fn report_bug(payload: BugReportPayload) -> Result<Option<String>, String> {
    let config = bug_report_config()?;

    // Authoritative sink. Its result is the BUG-xxx reference the user sees
    // and what gates overall success/failure.
    let identifier = linear::send_bug_report_to(
        LINEAR_API_URL,
        &config.linear.api_key,
        &config.linear.team_id,
        &config.linear.label_name,
        &payload,
    )
    .await?;

    // Best-effort sanitized public mirror. Spawned, not awaited: a slow or
    // hung GitHub call must NEVER inflate the user's toast latency (the
    // authoritative Linear result is already in `identifier`). User-approved
    // carve-out from the "no silent failures" rule, and NOT truly silent:
    // a real runtime failure still reaches the dev team via tracing::error!
    // + Sentry, so a quietly-rotting mirror stays detectable.
    if let Some(github) = config.github {
        let payload = payload.clone();
        tokio::spawn(async move {
            match github::send_bug_report_to(
                GITHUB_API_BASE,
                &github.token,
                GITHUB_REPO,
                GITHUB_LABEL,
                &payload,
            )
            .await
            {
                Ok(issue) => tracing::info!(
                    github_issue = issue.number,
                    github_issue_url = %issue.html_url,
                    "GitHub bug-report mirror created"
                ),
                Err(error) => {
                    tracing::error!(%error, "GitHub bug-report mirror failed");
                    sentry::capture_message(
                        &format!("GitHub bug-report mirror failed: {error}"),
                        sentry::Level::Error,
                    );
                }
            }
        });
    }

    Ok(identifier)
}

fn bug_report_config() -> Result<BugReportConfig, String> {
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

    let linear = match (api_key, team_id) {
        (Some(api_key), Some(team_id)) => LinearConfig {
            api_key,
            team_id,
            label_name,
        },
        (None, None) => {
            return Err(
                "Bug reporting not configured (missing LINEAR_API_KEY and LINEAR_TEAM_ID)"
                    .to_string(),
            )
        }
        (None, Some(_)) => {
            return Err("Bug reporting not configured (missing LINEAR_API_KEY)".to_string())
        }
        (Some(_), None) => {
            return Err("Bug reporting not configured (missing LINEAR_TEAM_ID)".to_string())
        }
    };

    let github = configured_value(
        std::env::var("GITHUB_BUG_TOKEN").ok(),
        option_env!("GITHUB_BUG_TOKEN"),
    )
    .map(|token| GithubConfig { token });

    Ok(BugReportConfig { linear, github })
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
