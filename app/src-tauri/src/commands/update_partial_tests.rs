//! The persisted partial: what survives a reopen, what starts it over, and
//! what a newer version sweeps away.

use super::{OpenError, PartialDownload, Sidecar};
use crate::commands::update_partial_dir::{prune_abandoned, ABANDONED_AFTER};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::SystemTime;

/// A fresh, empty directory per test (a dependency-free tempdir).
pub(crate) fn scratch_dir(tag: &str) -> PathBuf {
    static NEXT: AtomicU32 = AtomicU32::new(0);
    let dir = std::env::temp_dir().join(format!(
        "houston-update-{tag}-{}-{}",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    ));
    std::fs::create_dir_all(&dir).expect("scratch dir");
    dir
}

const URL: &str = "https://releases.example/houston/1.0.0/Houston.app.tar.gz";

fn sidecar(url: &str) -> Sidecar {
    Sidecar {
        url: url.to_string(),
        validator: Some("\"abc123\"".to_string()),
        total: Some(10),
    }
}

async fn seeded(dir: &std::path::Path, version: &str, url: &str, bytes: &[u8]) {
    let mut partial = PartialDownload::open(dir, version, url).unwrap();
    partial.restart(Some(sidecar(url))).await.unwrap();
    partial.append(bytes).await.unwrap();
    partial.settle().await.unwrap();
}

#[test]
fn a_fresh_open_has_nothing() {
    let dir = scratch_dir("fresh");
    let partial = PartialDownload::open(&dir, "1.0.0", URL).unwrap();
    assert_eq!(partial.len(), 0);
    assert_eq!(partial.validator(), None);
    assert_eq!(partial.total(), None);
    assert!(!partial.path().exists());
}

#[tokio::test]
async fn the_bytes_and_the_sidecar_survive_a_reopen_for_the_same_object() {
    let dir = scratch_dir("reopen");
    seeded(&dir, "1.0.0", URL, b"12345").await;
    let mut partial = PartialDownload::open(&dir, "1.0.0", URL).unwrap();
    assert_eq!(partial.len(), 5);
    assert_eq!(partial.validator(), Some("\"abc123\""));
    assert_eq!(partial.total(), Some(10));
    partial.append(b"67").await.unwrap();
    partial.settle().await.unwrap();
    assert_eq!(std::fs::read(partial.path()).unwrap(), b"1234567");
    assert_eq!(partial.len(), 7);
}

#[tokio::test]
async fn a_sidecar_for_another_url_starts_fresh() {
    let dir = scratch_dir("other-url");
    seeded(&dir, "1.0.0", URL, b"12345").await;
    let partial =
        PartialDownload::open(&dir, "1.0.0", "https://releases.example/moved.tar.gz").unwrap();
    assert_eq!(partial.len(), 0);
    assert_eq!(partial.validator(), None);
    assert!(!partial.path().exists(), "the stale bytes are gone");
    assert!(!dir.join("1.0.0.part.json").exists(), "and their sidecar");
}

#[test]
fn a_part_without_a_sidecar_is_removed() {
    let dir = scratch_dir("no-sidecar");
    std::fs::write(dir.join("1.0.0.part"), b"orphan").unwrap();
    let partial = PartialDownload::open(&dir, "1.0.0", URL).unwrap();
    assert_eq!(partial.len(), 0);
    assert!(!partial.path().exists());
}

#[tokio::test]
async fn opening_a_newer_version_prunes_the_older_partial() {
    let dir = scratch_dir("prune");
    seeded(&dir, "1.0.0", URL, b"12345").await;
    std::fs::write(dir.join("1.0.0.part.json.houston.tmp"), b"{").unwrap();
    let partial = PartialDownload::open(&dir, "1.0.1", URL).unwrap();
    assert_eq!(partial.len(), 0);
    let left: Vec<String> = std::fs::read_dir(&dir)
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    assert!(left.is_empty(), "nothing of 1.0.0 survives: {left:?}");
}

#[tokio::test]
async fn a_restart_without_a_sidecar_forgets_the_object() {
    let dir = scratch_dir("restart-none");
    seeded(&dir, "1.0.0", URL, b"12345").await;
    let mut partial = PartialDownload::open(&dir, "1.0.0", URL).unwrap();
    partial.restart(None).await.unwrap();
    assert_eq!(partial.len(), 0);
    assert_eq!(partial.validator(), None);
    assert_eq!(std::fs::metadata(partial.path()).unwrap().len(), 0);
    assert!(!dir.join("1.0.0.part.json").exists());
}

#[tokio::test]
async fn discard_removes_both_files() {
    let dir = scratch_dir("discard");
    seeded(&dir, "1.0.0", URL, b"12345").await;
    let mut partial = PartialDownload::open(&dir, "1.0.0", URL).unwrap();
    partial.discard().unwrap();
    assert!(!dir.join("1.0.0.part").exists());
    assert!(!dir.join("1.0.0.part.json").exists());
}

#[test]
fn the_version_is_sanitised_into_the_file_name() {
    let dir = scratch_dir("name");
    let partial = PartialDownload::open(&dir, "1.0.0+build/7", URL).unwrap();
    assert_eq!(
        partial.path().file_name().unwrap().to_str().unwrap(),
        "1.0.0_build_7.part"
    );
}

#[test]
fn an_unreadable_sidecar_starts_fresh() {
    let dir = scratch_dir("bad-sidecar");
    std::fs::write(dir.join("1.0.0.part"), b"12345").unwrap();
    std::fs::write(dir.join("1.0.0.part.json"), b"{not json").unwrap();
    let partial = PartialDownload::open(&dir, "1.0.0", URL).unwrap();
    assert_eq!(partial.len(), 0);
    assert!(!partial.path().exists());
    assert!(!dir.join("1.0.0.part.json").exists());
}

#[tokio::test]
async fn a_second_open_of_the_same_partial_is_refused_until_the_first_is_gone() {
    let dir = scratch_dir("in-flight");
    let mut first = PartialDownload::open(&dir, "1.0.0", URL).unwrap();
    first.restart(Some(sidecar(URL))).await.unwrap();
    first.append(b"writing").await.unwrap();
    first.settle().await.unwrap();
    assert!(matches!(
        PartialDownload::open(&dir, "1.0.0", URL),
        Err(OpenError::InProgress)
    ));
    let other_version = PartialDownload::open(&dir, "1.0.1", URL);
    assert!(other_version.is_ok(), "the hold is per partial, not global");
    assert_eq!(std::fs::read(dir.join("1.0.0.part")).unwrap(), b"writing");
    assert!(dir.join("1.0.0.part.json").exists());
    first.append(b" on").await.unwrap();
    first.settle().await.unwrap();
    assert_eq!(
        std::fs::read(dir.join("1.0.0.part")).unwrap(),
        b"writing on"
    );
    drop(other_version);
    drop(first);
    assert!(PartialDownload::open(&dir, "1.0.0", URL).is_ok());
    let _newer = PartialDownload::open(&dir, "1.0.2", URL).unwrap();
    assert!(!dir.join("1.0.0.part").exists());
}

#[tokio::test]
async fn the_startup_sweep_spares_a_partial_being_written() {
    let dir = scratch_dir("abandoned-held");
    let mut held = PartialDownload::open(&dir, "1.0.0", URL).unwrap();
    held.restart(Some(sidecar(URL))).await.unwrap();
    held.append(b"live").await.unwrap();
    held.settle().await.unwrap();
    prune_abandoned(&dir, "1.0.0", SystemTime::now());
    assert!(dir.join("1.0.0.part").exists(), "held, so spared");
}

#[tokio::test]
async fn a_restart_leaves_no_old_sidecar_vouching_for_the_new_file() {
    let dir = scratch_dir("restart-order");
    seeded(&dir, "1.0.0", URL, b"12345").await;
    let mut partial = PartialDownload::open(&dir, "1.0.0", URL).unwrap();
    let fresh = Sidecar {
        url: URL.to_string(),
        validator: Some("\"new\"".to_string()),
        total: Some(99),
    };
    partial.restart(Some(fresh.clone())).await.unwrap();
    let written: Sidecar =
        serde_json::from_slice(&std::fs::read(dir.join("1.0.0.part.json")).unwrap()).unwrap();
    assert_eq!(written, fresh);
    assert_eq!(
        std::fs::metadata(partial.path()).unwrap().len(),
        0,
        "probe cut back"
    );
}

#[test]
fn the_startup_sweep_drops_the_running_version_and_week_old_partials() {
    let dir = scratch_dir("abandoned");
    for version in ["1.0.0", "1.0.1", "1.0.2"] {
        std::fs::write(dir.join(format!("{version}.part")), version).unwrap();
        let sidecar = serde_json::to_vec(&sidecar(URL)).unwrap();
        std::fs::write(dir.join(format!("{version}.part.json")), sidecar).unwrap();
    }
    let now = SystemTime::now();
    let long_ago = now - ABANDONED_AFTER - std::time::Duration::from_secs(60);
    for name in ["1.0.1.part", "1.0.1.part.json"] {
        std::fs::OpenOptions::new()
            .write(true)
            .open(dir.join(name))
            .unwrap()
            .set_modified(long_ago)
            .unwrap();
    }
    prune_abandoned(&dir, "1.0.0", now);
    let mut left: Vec<String> = std::fs::read_dir(&dir)
        .unwrap()
        .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
        .collect();
    left.sort();
    assert_eq!(left, vec!["1.0.2.part", "1.0.2.part.json"]);
}
