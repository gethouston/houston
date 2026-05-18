use super::github::{github_http_error_message, send_bug_report_to};
use super::sample_payload;
use super::test_support::serve_sequence;
use reqwest::StatusCode;

#[test]
fn github_http_error_message_keeps_status_and_body() {
    let message = github_http_error_message(StatusCode::UNAUTHORIZED, "Bad credentials");
    assert_eq!(
        message,
        "GitHub API failed: 401 Unauthorized Bad credentials"
    );
}

#[tokio::test]
async fn create_issue_posts_sanitized_body() {
    let (base, server) = serve_sequence(vec![(
        "201 Created",
        "{\"number\":42,\"html_url\":\"https://github.com/gethouston/houston/issues/42\"}",
    )]);

    let issue = send_bug_report_to(
        &base,
        "test-token",
        "gethouston/houston",
        "user-bug",
        &sample_payload(),
    )
    .await
    .expect("create github issue");
    assert_eq!(issue.number, 42);
    assert_eq!(
        issue.html_url,
        "https://github.com/gethouston/houston/issues/42"
    );

    let requests = server.join().expect("join test server");
    let request = requests.first().expect("one request");
    assert!(request.starts_with("POST /repos/gethouston/houston/issues HTTP/1.1"));
    let lower = request.to_ascii_lowercase();
    assert!(lower.contains("authorization: bearer test-token"));
    assert!(lower.contains("x-github-api-version: 2022-11-28"));
    assert!(request.contains("\"labels\":[\"user-bug\"]"));
    assert!(request.contains("Houston bug: list_workspaces"));
    // Sanitized: no identifying user, no logs (logs leak email + OS paths).
    assert!(!request.contains("user@example.com"));
    assert!(!request.contains("- User:"));
    assert!(!request.contains("Backend Logs"));
    assert!(!request.contains("backend log line"));
    assert!(!request.contains("frontend log line"));
}

#[tokio::test]
async fn surfaces_http_error() {
    let (base, server) = serve_sequence(vec![(
        "401 Unauthorized",
        "{\"message\":\"Bad credentials\"}",
    )]);

    let error = send_bug_report_to(
        &base,
        "bad-token",
        "gethouston/houston",
        "user-bug",
        &sample_payload(),
    )
    .await
    .expect_err("401 should fail");

    server.join().expect("join test server");
    assert!(error.contains("401"));
    assert!(error.contains("Bad credentials"));
}

#[tokio::test]
#[ignore = "requires GITHUB_BUG_TOKEN via env; creates a real public issue on gethouston/houston"]
async fn creates_real_github_issue_when_env_is_set() {
    let token = std::env::var("GITHUB_BUG_TOKEN").expect("GITHUB_BUG_TOKEN set");
    let mut payload = sample_payload();
    payload.command = "local_github_bug_report_smoke_test".to_string();
    payload.error = format!(
        "Local GitHub bug-report smoke test from cargo test at {:?}",
        std::time::SystemTime::now()
    );

    send_bug_report_to(
        super::GITHUB_API_BASE,
        &token,
        super::GITHUB_REPO,
        super::GITHUB_LABEL,
        &payload,
    )
    .await
    .expect("create real GitHub issue");
}
