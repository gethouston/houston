//! `fetch_with_resume` against a scripted HTTP/1.1 server on a local socket:
//! each connection follows the next step of a script (serve the whole body,
//! cut it after N bytes, ignore the range, answer a status), and records the
//! `Range` header it was asked for.

use super::{
    fetch_with_resume, retry_delay, DownloadEvent, DownloadFailureKind, DOWNLOAD_ATTEMPTS,
};
use reqwest::header::HeaderMap;
use reqwest::{Client, Url};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

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
}

struct Script {
    steps: Vec<Step>,
    ranges: Vec<Option<String>>,
}

fn body() -> Vec<u8> {
    (0..20_000u32).map(|i| (i % 251) as u8).collect()
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
            // reqwest sends header names lowercased.
            let range = head.lines().find_map(|l| {
                l.to_ascii_lowercase()
                    .strip_prefix("range: bytes=")
                    .map(|r| r.trim_end_matches('-').to_string())
            });
            let step = {
                let mut script = script.lock().unwrap();
                script.ranges.push(range.clone());
                if script.steps.is_empty() {
                    Step::Serve { cut: None }
                } else {
                    script.steps.remove(0)
                }
            };
            let full = body();
            let (status, from, cut) = match step {
                Step::Serve { cut } => {
                    let from = range
                        .as_deref()
                        .and_then(|r| r.parse::<usize>().ok())
                        .unwrap_or(0);
                    (if from > 0 { 206 } else { 200 }, from, cut)
                }
                Step::IgnoreRange => (200, 0, None),
                Step::Status(code) => (code, 0, Some(0)),
            };
            let payload = &full[from..];
            let mut response = format!(
                "HTTP/1.1 {status} X\r\nContent-Length: {}\r\nConnection: close\r\n",
                payload.len()
            );
            if status == 206 {
                response.push_str(&format!(
                    "Content-Range: bytes {from}-{}/{}\r\n",
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

async fn run(
    steps: Vec<Step>,
) -> (
    Result<Vec<u8>, super::DownloadFailure>,
    Vec<DownloadEvent>,
    Vec<Option<String>>,
) {
    let script = Arc::new(Mutex::new(Script {
        steps,
        ranges: Vec::new(),
    }));
    let url = serve(script.clone()).await;
    let client = Client::builder().build().unwrap();
    let mut events = Vec::new();
    let result = fetch_with_resume(&client, &url, &HeaderMap::new(), |e| events.push(e)).await;
    let ranges = script.lock().unwrap().ranges.clone();
    (result, events, ranges)
}

fn started(events: &[DownloadEvent]) -> usize {
    events
        .iter()
        .filter(|e| matches!(e, DownloadEvent::Started { .. }))
        .count()
}

#[tokio::test(start_paused = true)]
async fn resumes_twice_then_completes() {
    let steps = vec![
        Step::Serve { cut: Some(5_000) },
        Step::Serve { cut: Some(7_000) },
        Step::Serve { cut: None },
    ];
    let (result, events, ranges) = run(steps).await;
    assert_eq!(result.unwrap(), body());
    assert_eq!(
        ranges,
        vec![None, Some("5000".into()), Some("12000".into())]
    );
    assert_eq!(started(&events), 1, "a resume never resets the tally");
    assert_eq!(events.last(), Some(&DownloadEvent::Finished));
    let progressed: usize = events
        .iter()
        .filter_map(|e| match e {
            DownloadEvent::Progress { chunk_length } => Some(*chunk_length),
            _ => None,
        })
        .sum();
    assert_eq!(progressed, body().len());
}

#[tokio::test(start_paused = true)]
async fn restarts_when_the_server_ignores_the_range() {
    let (result, events, ranges) =
        run(vec![Step::Serve { cut: Some(3_000) }, Step::IgnoreRange]).await;
    assert_eq!(result.unwrap(), body());
    assert_eq!(ranges, vec![None, Some("3000".into())]);
    assert_eq!(
        started(&events),
        2,
        "a 200 on a ranged request restarts the tally"
    );
}

#[tokio::test(start_paused = true)]
async fn gives_up_after_the_attempt_budget_with_the_byte_position() {
    let steps = (0..DOWNLOAD_ATTEMPTS)
        .map(|_| Step::Serve { cut: Some(1_000) })
        .collect();
    let (result, _, ranges) = run(steps).await;
    let failure = result.unwrap_err();
    assert_eq!(failure.kind, DownloadFailureKind::Network);
    assert_eq!(failure.attempts, DOWNLOAD_ATTEMPTS);
    assert_eq!(failure.received, 1_000 * DOWNLOAD_ATTEMPTS as u64);
    assert_eq!(failure.total, Some(body().len() as u64));
    assert_eq!(ranges.len() as u32, DOWNLOAD_ATTEMPTS);
}

#[tokio::test(start_paused = true)]
async fn an_http_status_is_final_on_first_sight() {
    let (result, _, ranges) = run(vec![Step::Status(404)]).await;
    let failure = result.unwrap_err();
    assert_eq!(failure.kind, DownloadFailureKind::Http);
    assert!(failure.message.contains("404"), "{}", failure.message);
    assert_eq!(ranges.len(), 1, "no retry for a status answer");
}

#[test]
fn backoff_grows_per_retry() {
    assert_eq!(retry_delay(1), Duration::from_secs(1));
    assert_eq!(retry_delay(2), Duration::from_secs(3));
    assert_eq!(retry_delay(3), Duration::from_secs(9));
}
