//! `fetch_with_resume` against a scripted HTTP/1.1 server on a local socket:
//! each connection follows the next step of a script (serve the whole body,
//! cut it after N bytes, ignore the range, answer a status, re-publish the
//! asset, resume under a new validator), records the `Range` and `If-Range`
//! it was asked for, and honours a range only when the `If-Range` names the
//! object it currently serves, the way a well-behaved origin does. Every
//! `fetch` on the harness is one CALL of the download (one poll): it reopens
//! the partial from the same directory.

use super::{
    attempt_budget, fetch_with_resume, retry_delay, DownloadEvent, DownloadFailure,
    DOWNLOAD_ATTEMPTS,
};
use crate::commands::update_failure::DownloadFailureKind;
use crate::commands::update_partial::tests::scratch_dir;
use crate::commands::update_partial::{OpenError, PartialDownload, Sidecar};
use reqwest::header::HeaderMap;
use reqwest::{Client, Url};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

const VERSION: &str = "1.2.3";

#[derive(Clone, Copy)]
enum Step {
    /// Honour the range (206) or serve everything (200), then cut the
    /// connection after `cut` body bytes (`None` = serve it all).
    Serve {
        cut: Option<usize>,
    },
    /// Answer 200 with the FULL body even when a range was asked for.
    IgnoreRange,
    Status(u16),
    /// The asset was re-published under a new validator: serve it all.
    Republish(&'static str),
    /// GitHub's CDN: honour the range whatever the `If-Range` said, under a
    /// new validator, as if the asset had been re-published underneath.
    StaleResume(&'static str),
    /// A 206 whose body starts at byte 0 regardless of the range asked.
    MisalignedResume,
}

#[derive(Clone, Debug, PartialEq)]
struct Seen {
    range: Option<String>,
    if_range: Option<String>,
}

struct Script {
    steps: Vec<Step>,
    seen: Vec<Seen>,
    etag: &'static str,
}

fn body() -> Vec<u8> {
    (0..20_000u32).map(|i| (i % 251) as u8).collect()
}

fn header(head: &str, name: &str) -> Option<String> {
    head.lines().find_map(|line| {
        let (key, value) = line.split_once(':')?;
        key.trim()
            .eq_ignore_ascii_case(name)
            .then(|| value.trim().to_string())
    })
}

async fn serve(script: Arc<Mutex<Script>>) -> Url {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = Url::parse(&format!("http://{}/asset", listener.local_addr().unwrap())).unwrap();
    tokio::spawn(async move {
        loop {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut head = Vec::new();
            let mut byte = [0u8; 1];
            while !head.ends_with(b"\r\n\r\n") {
                if socket.read(&mut byte).await.unwrap() == 0 {
                    break;
                }
                head.push(byte[0]);
            }
            let head = String::from_utf8_lossy(&head).to_string();
            let range = header(&head, "range").and_then(|r| {
                r.strip_prefix("bytes=")
                    .map(|r| r.trim_end_matches('-').to_string())
            });
            let if_range = header(&head, "if-range");
            let asked = range.as_deref().and_then(|r| r.parse::<usize>().ok());
            let (step, etag) = {
                let mut script = script.lock().unwrap();
                script.seen.push(Seen {
                    range: range.clone(),
                    if_range: if_range.clone(),
                });
                let step = if script.steps.is_empty() {
                    Step::Serve { cut: None }
                } else {
                    script.steps.remove(0)
                };
                if let Step::Republish(tag) | Step::StaleResume(tag) = step {
                    script.etag = tag;
                }
                (step, script.etag)
            };
            let etag = format!("\"{etag}\"");
            let full = body();
            let (status, from, cut, claimed) = match step {
                Step::Serve { cut } => {
                    let matches = if_range.as_deref().is_none_or(|v| v == etag);
                    let from = if matches { asked.unwrap_or(0) } else { 0 };
                    (if from > 0 { 206 } else { 200 }, from, cut, from)
                }
                Step::StaleResume(_) => {
                    let from = asked.unwrap_or(0);
                    (206, from, None, from)
                }
                Step::MisalignedResume => (206, 0, None, 0),
                Step::IgnoreRange | Step::Republish(_) => (200, 0, None, 0),
                Step::Status(code) => (code, 0, Some(0), 0),
            };
            let payload = &full[from..];
            let mut response = format!(
                "HTTP/1.1 {status} X\r\nContent-Length: {}\r\nETag: {etag}\r\nConnection: close\r\n",
                payload.len()
            );
            if status == 206 {
                response.push_str(&format!(
                    "Content-Range: bytes {claimed}-{}/{}\r\n",
                    full.len() - 1,
                    full.len()
                ));
            }
            response.push_str("\r\n");
            socket.write_all(response.as_bytes()).await.unwrap();
            let sent = cut.map_or(payload, |n| &payload[..n.min(payload.len())]);
            socket.write_all(sent).await.unwrap();
            socket.flush().await.unwrap();
            drop(socket);
        }
    });
    url
}

struct Harness {
    script: Arc<Mutex<Script>>,
    url: Url,
    dir: PathBuf,
    client: Client,
}

impl Harness {
    async fn new(steps: Vec<Step>) -> Self {
        let script = Arc::new(Mutex::new(Script {
            steps,
            seen: Vec::new(),
            etag: "v1",
        }));
        let url = serve(script.clone()).await;
        Self {
            script,
            url,
            dir: scratch_dir("fetch"),
            client: Client::builder().build().unwrap(),
        }
    }

    fn try_open(&self) -> Result<PartialDownload, OpenError> {
        PartialDownload::open(&self.dir, VERSION, self.url.as_str())
    }

    fn open(&self) -> PartialDownload {
        self.try_open().unwrap()
    }

    /// One call of the download with `attempts`, the way `download_update`
    /// runs it: the in-flight refusal is the same typed failure.
    async fn fetch_with(&self, attempts: u32) -> (Result<(), DownloadFailure>, Vec<DownloadEvent>) {
        let mut partial = match self.try_open() {
            Ok(partial) => partial,
            Err(OpenError::InProgress) => {
                return (Err(DownloadFailure::in_progress(VERSION)), Vec::new())
            }
            Err(OpenError::Io(e)) => panic!("open partial: {e}"),
        };
        let mut events = Vec::new();
        let result = fetch_with_resume(
            &self.client,
            &self.url,
            &HeaderMap::new(),
            &mut partial,
            attempts,
            |e| events.push(e),
        )
        .await;
        (result, events)
    }

    /// One call of the download, the way one poll runs it.
    async fn fetch(&self) -> (Result<(), DownloadFailure>, Vec<DownloadEvent>) {
        self.fetch_with(DOWNLOAD_ATTEMPTS).await
    }

    fn seen(&self) -> Vec<Seen> {
        self.script.lock().unwrap().seen.clone()
    }

    fn ranges(&self) -> Vec<Option<String>> {
        self.seen().into_iter().map(|s| s.range).collect()
    }

    fn part_path(&self) -> PathBuf {
        self.dir.join(format!("{VERSION}.part"))
    }

    fn sidecar_path(&self) -> PathBuf {
        self.dir.join(format!("{VERSION}.part.json"))
    }

    fn part(&self) -> Vec<u8> {
        std::fs::read(self.part_path()).unwrap_or_default()
    }

    /// A first call that spends its whole budget and leaves `kept` bytes.
    async fn exhaust(&self) -> usize {
        let (first, _) = self.fetch().await;
        assert!(first.is_err());
        1_000 * DOWNLOAD_ATTEMPTS as usize
    }
}

fn started(events: &[DownloadEvent]) -> usize {
    events
        .iter()
        .filter(|e| matches!(e, DownloadEvent::Started { .. }))
        .count()
}

fn progressed(events: &[DownloadEvent]) -> usize {
    events
        .iter()
        .filter_map(|e| match e {
            DownloadEvent::Progress { chunk_length } => Some(*chunk_length),
            _ => None,
        })
        .sum()
}

fn cut_every_attempt(cut: usize) -> Vec<Step> {
    (0..DOWNLOAD_ATTEMPTS)
        .map(|_| Step::Serve { cut: Some(cut) })
        .collect()
}

fn exhausted_then(step: Step) -> Vec<Step> {
    let mut steps = cut_every_attempt(1_000);
    steps.push(step);
    steps
}

#[tokio::test(start_paused = true)]
async fn resumes_twice_then_completes() {
    let steps = vec![
        Step::Serve { cut: Some(5_000) },
        Step::Serve { cut: Some(7_000) },
        Step::Serve { cut: None },
    ];
    let harness = Harness::new(steps).await;
    let (result, events) = harness.fetch().await;
    result.unwrap();
    assert_eq!(harness.part(), body());
    assert_eq!(
        harness.seen(),
        vec![
            Seen {
                range: None,
                if_range: None
            },
            Seen {
                range: Some("5000".into()),
                if_range: Some("\"v1\"".into())
            },
            Seen {
                range: Some("12000".into()),
                if_range: Some("\"v1\"".into())
            },
        ],
        "a resume names the object it is resuming"
    );
    assert_eq!(started(&events), 1, "a resume never resets the tally");
    assert_eq!(events.last(), Some(&DownloadEvent::Finished));
    assert_eq!(progressed(&events), body().len());
}

#[tokio::test(start_paused = true)]
async fn restarts_when_the_server_ignores_the_range() {
    let harness = Harness::new(vec![Step::Serve { cut: Some(3_000) }, Step::IgnoreRange]).await;
    let (result, events) = harness.fetch().await;
    result.unwrap();
    assert_eq!(harness.part(), body());
    assert_eq!(harness.ranges(), vec![None, Some("3000".into())]);
    assert_eq!(
        started(&events),
        2,
        "a 200 on a ranged request restarts the tally"
    );
}

#[tokio::test(start_paused = true)]
async fn gives_up_after_the_attempt_budget_and_keeps_the_bytes() {
    let harness = Harness::new(cut_every_attempt(1_000)).await;
    let (result, _) = harness.fetch().await;
    let failure = result.unwrap_err();
    assert_eq!(failure.kind, DownloadFailureKind::Network);
    assert_eq!(failure.attempts, DOWNLOAD_ATTEMPTS);
    assert_eq!(failure.received, 1_000 * DOWNLOAD_ATTEMPTS as u64);
    assert_eq!(failure.total, Some(body().len() as u64));
    assert_eq!(harness.ranges().len() as u32, DOWNLOAD_ATTEMPTS);
    let kept = 1_000 * DOWNLOAD_ATTEMPTS as usize;
    assert_eq!(
        harness.part(),
        body()[..kept],
        "the partial survives the call"
    );
    assert!(
        harness.sidecar_path().exists(),
        "with the object it belongs to"
    );
}

#[tokio::test(start_paused = true)]
async fn a_short_budget_stops_early_and_still_keeps_the_bytes() {
    let harness = Harness::new(cut_every_attempt(1_000)).await;
    let (result, _) = harness.fetch_with(2).await;
    let failure = result.unwrap_err();
    assert_eq!(failure.attempts, 2);
    assert_eq!(harness.ranges().len(), 2, "two requests, no more");
    assert_eq!(harness.part(), body()[..2_000]);
}

#[test]
fn the_attempt_budget_is_clamped_to_the_ladder() {
    assert_eq!(attempt_budget(None), DOWNLOAD_ATTEMPTS);
    assert_eq!(attempt_budget(Some(0)), 1);
    assert_eq!(attempt_budget(Some(2)), 2);
    assert_eq!(attempt_budget(Some(99)), DOWNLOAD_ATTEMPTS);
}

#[tokio::test(start_paused = true)]
async fn the_next_call_resumes_from_the_persisted_bytes() {
    let harness = Harness::new(exhausted_then(Step::Serve { cut: None })).await;
    let kept = harness.exhaust().await;

    let (second, events) = harness.fetch().await;
    second.unwrap();
    assert_eq!(harness.part(), body());
    assert_eq!(
        harness.seen()[DOWNLOAD_ATTEMPTS as usize],
        Seen {
            range: Some(kept.to_string()),
            if_range: Some("\"v1\"".into())
        },
        "the second call asks for the rest of the same object"
    );
    assert_eq!(
        &events[..2],
        &[
            DownloadEvent::Started {
                content_length: Some(body().len() as u64)
            },
            DownloadEvent::Progress { chunk_length: kept },
        ],
        "the tally is primed with what was already on disk"
    );
    assert_eq!(started(&events), 1);
    assert_eq!(progressed(&events), body().len());
    assert_eq!(events.last(), Some(&DownloadEvent::Finished));
}

#[tokio::test(start_paused = true)]
async fn a_republished_asset_restarts_the_file() {
    let harness = Harness::new(exhausted_then(Step::Republish("v2"))).await;
    harness.exhaust().await;

    let (second, events) = harness.fetch().await;
    second.unwrap();
    assert_eq!(harness.part(), body(), "nothing of the old object is kept");
    assert_eq!(
        harness.seen()[DOWNLOAD_ATTEMPTS as usize].if_range,
        Some("\"v1\"".into())
    );
    assert_eq!(
        started(&events),
        2,
        "the primed tally is reset by the full body"
    );
    assert_eq!(
        harness.open().validator(),
        Some("\"v2\""),
        "the sidecar now names the new object"
    );
}

#[tokio::test(start_paused = true)]
async fn a_206_under_a_new_validator_restarts_the_file() {
    let harness = Harness::new(exhausted_then(Step::StaleResume("v2"))).await;
    let kept = harness.exhaust().await;

    let (second, events) = harness.fetch().await;
    second.unwrap();
    assert_eq!(
        harness.part(),
        body(),
        "the stale 206 body was never joined"
    );
    let seen = harness.seen();
    assert_eq!(
        seen[DOWNLOAD_ATTEMPTS as usize].range,
        Some(kept.to_string())
    );
    assert_eq!(
        seen[DOWNLOAD_ATTEMPTS as usize + 1].range,
        None,
        "after the reset the next request asks for a full body"
    );
    assert_eq!(started(&events), 2);
}

#[tokio::test(start_paused = true)]
async fn a_misaligned_206_restarts_the_file() {
    let harness = Harness::new(exhausted_then(Step::MisalignedResume)).await;
    harness.exhaust().await;

    let (second, _) = harness.fetch().await;
    second.unwrap();
    assert_eq!(harness.part(), body());
    assert_eq!(harness.seen()[DOWNLOAD_ATTEMPTS as usize + 1].range, None);
}

#[tokio::test(start_paused = true)]
async fn a_416_restarts_the_file() {
    let harness = Harness::new(exhausted_then(Step::Status(416))).await;
    harness.exhaust().await;

    let (second, _) = harness.fetch().await;
    second.unwrap();
    assert_eq!(harness.part(), body());
    assert_eq!(harness.seen()[DOWNLOAD_ATTEMPTS as usize + 1].range, None);
}

#[tokio::test(start_paused = true)]
async fn a_completed_partial_needs_no_request() {
    let harness = Harness::new(Vec::new()).await;
    let mut partial = harness.open();
    let sidecar = Sidecar {
        url: harness.url.to_string(),
        validator: None,
        total: Some(body().len() as u64),
    };
    partial.restart(Some(sidecar)).await.unwrap();
    partial.append(&body()).await.unwrap();
    partial.settle().await.unwrap();
    drop(partial);

    let (result, events) = harness.fetch().await;
    result.unwrap();
    assert!(harness.seen().is_empty(), "nothing was asked of the server");
    assert_eq!(events.last(), Some(&DownloadEvent::Finished));
    assert_eq!(progressed(&events), body().len());
}

#[tokio::test(start_paused = true)]
async fn a_concurrent_call_on_the_same_version_is_refused() {
    let harness = Harness::new(Vec::new()).await;
    let ((first, _), (second, second_events)) = tokio::join!(harness.fetch(), harness.fetch());
    first.unwrap();
    let refused = second.unwrap_err();
    assert_eq!(refused.kind, DownloadFailureKind::InProgress);
    assert!(second_events.is_empty());
    assert_eq!(harness.part(), body(), "one writer, one clean file");
    assert_eq!(harness.seen().len(), 1, "one request in total");
    let (third, _) = harness.fetch().await;
    third.unwrap();
}

#[tokio::test(start_paused = true)]
async fn an_http_status_is_final_on_first_sight() {
    let harness = Harness::new(vec![Step::Status(404)]).await;
    let (result, _) = harness.fetch().await;
    let failure = result.unwrap_err();
    assert_eq!(failure.kind, DownloadFailureKind::Http);
    assert_eq!(failure.status, Some(404));
    assert!(failure.message.contains("404"), "{}", failure.message);
    assert_eq!(harness.ranges().len(), 1, "no retry for a status answer");
}

#[tokio::test(start_paused = true)]
async fn a_final_status_on_the_resume_discards_the_partial() {
    let harness = Harness::new(exhausted_then(Step::Status(404))).await;
    harness.exhaust().await;
    assert!(harness.part_path().exists());

    let (second, _) = harness.fetch().await;
    assert_eq!(second.unwrap_err().kind, DownloadFailureKind::Http);
    assert!(
        !harness.part_path().exists(),
        "the asset is gone, so are its bytes"
    );
    assert!(!harness.sidecar_path().exists());
}

#[tokio::test(start_paused = true)]
async fn a_transient_status_is_retried_and_the_resume_keeps_its_bytes() {
    let steps = vec![
        Step::Serve { cut: Some(4_000) },
        Step::Status(504),
        Step::Status(503),
        Step::Serve { cut: None },
    ];
    let harness = Harness::new(steps).await;
    let (result, events) = harness.fetch().await;
    result.unwrap();
    assert_eq!(harness.part(), body());
    assert_eq!(
        harness.ranges(),
        vec![
            None,
            Some("4000".into()),
            Some("4000".into()),
            Some("4000".into())
        ]
    );
    assert_eq!(
        started(&events),
        1,
        "a status answer never resets the tally"
    );
    assert_eq!(events.last(), Some(&DownloadEvent::Finished));
}

#[tokio::test(start_paused = true)]
async fn a_transient_status_that_never_clears_reports_as_upstream() {
    let steps = (0..DOWNLOAD_ATTEMPTS).map(|_| Step::Status(504)).collect();
    let harness = Harness::new(steps).await;
    let (result, _) = harness.fetch().await;
    let failure = result.unwrap_err();
    assert_eq!(failure.kind, DownloadFailureKind::Upstream);
    assert_eq!(failure.status, Some(504));
    assert_eq!(failure.attempts, DOWNLOAD_ATTEMPTS);
    assert_eq!(failure.received, 0);
    assert!(failure.message.contains("504"), "{}", failure.message);
    assert_eq!(harness.ranges().len() as u32, DOWNLOAD_ATTEMPTS);
}

#[tokio::test(start_paused = true)]
async fn a_full_disk_mid_body_discards_the_partial_and_is_final() {
    let harness = Harness::new(Vec::new()).await;
    let mut partial = harness.open();
    partial.fail_writes_with(std::io::ErrorKind::StorageFull);
    let mut events = Vec::new();
    let result = fetch_with_resume(
        &harness.client,
        &harness.url,
        &HeaderMap::new(),
        &mut partial,
        DOWNLOAD_ATTEMPTS,
        |e| events.push(e),
    )
    .await;
    let failure = result.unwrap_err();
    assert_eq!(failure.kind, DownloadFailureKind::StorageFull);
    assert_eq!(failure.attempts, 1, "no retry against a full disk");
    assert_eq!(harness.seen().len(), 1);
    assert!(
        !harness.part_path().exists(),
        "the bytes it could not keep are freed"
    );
    assert!(!harness.sidecar_path().exists());
    assert_eq!(
        started(&events),
        1,
        "the 200 was seen before the first write failed"
    );
}

#[test]
fn a_full_disk_is_its_own_class_and_never_retried() {
    let full = std::io::Error::from(std::io::ErrorKind::StorageFull);
    let failure = DownloadFailure::io("write partial download", &full);
    assert_eq!(failure.kind, DownloadFailureKind::StorageFull);
    assert!(!failure.kind.is_retryable());
    let quota = std::io::Error::from(std::io::ErrorKind::QuotaExceeded);
    assert_eq!(
        DownloadFailure::io("write", &quota).kind,
        DownloadFailureKind::StorageFull
    );
    let other = std::io::Error::from(std::io::ErrorKind::PermissionDenied);
    assert_eq!(
        DownloadFailure::io("write", &other).kind,
        DownloadFailureKind::Other
    );
}

#[test]
fn backoff_grows_per_retry_and_caps_at_a_minute() {
    assert_eq!(retry_delay(1), Duration::from_secs(3));
    assert_eq!(retry_delay(2), Duration::from_secs(10));
    assert_eq!(retry_delay(3), Duration::from_secs(30));
    assert_eq!(retry_delay(4), Duration::from_secs(60));
    assert_eq!(retry_delay(9), Duration::from_secs(60));
    let waited: Duration = (1..DOWNLOAD_ATTEMPTS).map(retry_delay).sum();
    assert!(
        waited >= Duration::from_secs(60),
        "a call outlasts a wifi hiccup"
    );
}
