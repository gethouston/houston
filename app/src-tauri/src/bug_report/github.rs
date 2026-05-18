use std::time::Duration;

use reqwest::StatusCode;
use serde::{Deserialize, Serialize};

use super::format::{format_issue_description, format_issue_title, Audience};
use super::BugReportPayload;

/// Hard ceiling on a single GitHub request. The mirror runs in a detached
/// task and would otherwise sit forever if the API hangs mid-response;
/// bounding it keeps zombie tasks from accumulating across many reports.
const HTTP_TIMEOUT: Duration = Duration::from_secs(15);

pub(super) async fn send_bug_report_to(
    api_base: &str,
    token: &str,
    repo: &str,
    label: &str,
    payload: &BugReportPayload,
) -> Result<GithubIssueRef, String> {
    let client = reqwest::Client::builder()
        .timeout(HTTP_TIMEOUT)
        .build()
        .map_err(|e| format!("Failed to build GitHub HTTP client: {e}"))?;
    let request = GithubIssueCreate {
        title: format_issue_title(payload),
        body: format_issue_description(payload, Audience::PublicMirror),
        labels: vec![label.to_string()],
    };

    let response = client
        .post(format!("{api_base}/repos/{repo}/issues"))
        .header("Authorization", format!("Bearer {token}"))
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .header("User-Agent", "houston-bug-reporter")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("GitHub API request failed: {e}"))?;

    let status = response.status();
    if !status.is_success() {
        let body = response
            .text()
            .await
            .unwrap_or_else(|e| format!("could not read GitHub response body: {e}"));
        return Err(github_http_error_message(status, &body));
    }

    response
        .json::<GithubIssueRef>()
        .await
        .map_err(|e| format!("GitHub API response was not valid JSON: {e}"))
}

pub(super) fn github_http_error_message(status: StatusCode, body: &str) -> String {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return format!("GitHub API failed: {status}");
    }
    format!(
        "GitHub API failed: {status} {}",
        super::format::truncate_chars(trimmed, 160)
    )
}

#[derive(Serialize)]
struct GithubIssueCreate {
    title: String,
    body: String,
    labels: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub(super) struct GithubIssueRef {
    pub(super) number: u64,
    pub(super) html_url: String,
}
