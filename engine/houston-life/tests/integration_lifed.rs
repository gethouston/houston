//! End-to-end smoke against a locally-running `lifed`.
//!
//! Skipped (with a printed reason) when `/tmp/life/life.sock` is absent —
//! so this passes in CI environments that don't run a Life backend. To
//! exercise it locally:
//!
//! ```bash
//! # in core/life:
//! mkdir -p /tmp/life
//! LIFED_ALLOW_MOCK_FALLBACK=true ./.target/debug/lifed daemon \
//!     --config /tmp/lifed-local.toml --allow-mock-fallback
//!
//! # in this crate:
//! cargo test -p houston-life --test integration_lifed -- --nocapture
//! ```

use std::path::Path;

use houston_life::proto::life::v1::CreateSessionReq;
use houston_life::LifeClient;

const SOCK_PATH: &str = "/tmp/life/life.sock";

#[tokio::test]
async fn create_session_against_local_lifed() {
    if !Path::new(SOCK_PATH).exists() {
        eprintln!("SKIP: {SOCK_PATH} not present — start `lifed` locally to exercise this test");
        return;
    }

    // lifed's dev signer accepts `test-token-for-{user_id}` (jwks.rs:232).
    // lifegw uses `dev-token-for-{user_id}` for Tier-1; lifed itself
    // verifies Tier-2 — for direct-UDS testing we use lifed's prefix.
    let client = LifeClient::connect_uds(SOCK_PATH, "test-token-for-houston-test")
        .await
        .expect("connect to local lifed");

    let req = client
        .authed_request(CreateSessionReq {
            user_id: "houston-test".into(),
            project_id: "default-project".into(),
            label: "stage0-smoke".into(),
            resume_sid: None,
            inherit_policy: None,
        })
        .expect("build authed request");

    let mut agent = client.agent();
    let session = agent
        .create_session(req)
        .await
        .expect("CreateSession should succeed against mock-substrate lifed")
        .into_inner();

    eprintln!(
        "created session: sid={:?}, agent_id={:?}",
        session.sid, session.agent_id
    );
    assert!(session.sid.is_some(), "session must carry a sid");
    assert!(session.agent_id.is_some(), "session must carry an agent_id");
}
