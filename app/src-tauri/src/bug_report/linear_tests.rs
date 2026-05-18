use super::linear::send_bug_report_to;
use super::linear_graphql::{
    linear_graphql_error_message, linear_http_error_message, LinearGraphqlError,
};
use super::sample_payload;
use super::test_support::serve_sequence;
use reqwest::StatusCode;

#[test]
fn linear_http_error_message_keeps_status_and_body() {
    let message = linear_http_error_message(StatusCode::BAD_REQUEST, "bad input");
    assert_eq!(message, "Linear API failed: 400 Bad Request bad input");
}

#[test]
fn linear_graphql_error_message_summarizes_errors() {
    let errors = vec![
        LinearGraphqlError {
            message: "teamId is invalid".to_string(),
        },
        LinearGraphqlError {
            message: "permission denied".to_string(),
        },
    ];
    assert_eq!(
        linear_graphql_error_message(&errors),
        "Linear API returned GraphQL errors: teamId is invalid; permission denied"
    );
}

#[tokio::test]
async fn send_bug_report_posts_linear_issue_create_mutation() {
    let (url, server) = serve_sequence(vec![
        (
            "200 OK",
            "{\"data\":{\"team\":{\"labels\":{\"nodes\":[{\"id\":\"label-id\",\"name\":\"User Bug\"}]}}}}",
        ),
        (
            "200 OK",
            "{\"data\":{\"issueCreate\":{\"success\":true,\"issue\":{\"id\":\"issue-id\",\"identifier\":\"BUG-1\",\"url\":\"https://linear.app/issue/BUG-1\"}}}}",
        ),
    ]);

    let identifier = send_bug_report_to(
        &format!("{url}/graphql"),
        "test-api-key",
        "team-id",
        "User Bug",
        &sample_payload(),
    )
    .await
    .expect("send bug report");
    assert_eq!(identifier.as_deref(), Some("BUG-1"));

    let requests = server.join().expect("join test server");
    let joined = requests.join("\n---REQUEST---\n");
    let lower = joined.to_ascii_lowercase();
    assert!(requests
        .iter()
        .all(|request| request.starts_with("POST /graphql HTTP/1.1")));
    assert!(lower.contains("authorization: test-api-key"));
    assert!(joined.contains("HoustonBugReportLabel"));
    assert!(joined.contains("\"labelName\":\"User Bug\""));
    assert!(joined.contains("HoustonBugReportCreate"));
    assert!(joined.contains("\"teamId\":\"team-id\""));
    assert!(joined.contains("\"labelIds\":[\"label-id\"]"));
    assert!(
        joined.contains("\"title\":\"Houston bug: list_workspaces - Error: no workspace found\"")
    );
}

#[tokio::test]
async fn send_bug_report_surfaces_graphql_errors() {
    let (url, server) = serve_sequence(vec![(
        "200 OK",
        "{\"errors\":[{\"message\":\"teamId is invalid\"}]}",
    )]);

    let error = send_bug_report_to(
        &format!("{url}/graphql"),
        "test-api-key",
        "team-id",
        "User Bug",
        &sample_payload(),
    )
    .await
    .expect_err("GraphQL error should fail");

    server.join().expect("join test server");
    assert_eq!(
        error,
        "Linear API returned GraphQL errors: teamId is invalid"
    );
}

#[tokio::test]
async fn send_bug_report_fails_when_label_is_missing() {
    let (url, server) = serve_sequence(vec![(
        "200 OK",
        "{\"data\":{\"team\":{\"labels\":{\"nodes\":[]}}}}",
    )]);

    let error = send_bug_report_to(
        &format!("{url}/graphql"),
        "test-api-key",
        "team-id",
        "User Bug",
        &sample_payload(),
    )
    .await
    .expect_err("missing label should fail");

    server.join().expect("join test server");
    assert_eq!(error, "Linear bug label not found: User Bug");
}

#[tokio::test]
#[ignore = "requires Linear config via env or local .env; creates a real Linear issue"]
async fn creates_real_linear_issue_when_env_is_set() {
    let mut payload = sample_payload();
    payload.command = "local_linear_bug_report_smoke_test".to_string();
    payload.error = format!(
        "Local Linear bug-report smoke test from cargo test at {:?}",
        std::time::SystemTime::now()
    );

    super::report_bug(payload)
        .await
        .expect("create real Linear issue");
}
