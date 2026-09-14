use super::{
    classify, decide, dialog_body, is_webview_creation_error, parse_hresult, probe_writable,
    recorded_failure, Cause, Decision, FailureRecorder, Report, DIALOG_TITLE,
};
use std::path::PathBuf;
use std::sync::Once;
use tracing_subscriber::layer::SubscriberExt;

const RUNTIME_LINE: &str = "failed to create webview: WebView2 error: WindowsError(Error { code: HRESULT(0x80070057), message: \"The parameter is incorrect.\" })";

fn healthy_report() -> Report {
    Report {
        message: Some(RUNTIME_LINE.to_string()),
        hresult: Some(0x8007_0057),
        runtime_version: Some("140.0.3485.66".to_string()),
        data_dir: Some(PathBuf::from(
            "C:\\Users\\a\\AppData\\Local\\com.houston.app",
        )),
        data_dir_writable: Some(true),
    }
}

#[test]
fn first_dead_window_relaunches_second_fails_closed() {
    assert_eq!(decide(false), Decision::Relaunch);
    assert_eq!(decide(true), Decision::FailClosed);
}

#[test]
fn hresult_is_read_from_the_runtime_line() {
    assert_eq!(parse_hresult(RUNTIME_LINE), Some(0x8007_0057));
    assert_eq!(
        parse_hresult("failed to create webview: something else"),
        None
    );
    assert_eq!(parse_hresult("HRESULT(0x)"), None);
}

#[test]
fn missing_runtime_wins_then_unwritable_folder_then_broken_runtime() {
    let mut report = healthy_report();
    assert_eq!(classify(&report), Cause::RuntimeBroken);
    report.data_dir_writable = Some(false);
    assert_eq!(classify(&report), Cause::DataFolderUnwritable);
    report.runtime_version = None;
    assert_eq!(classify(&report), Cause::RuntimeMissing);
}

#[test]
fn broken_runtime_dialog_points_at_the_repair_and_the_code() {
    let body = dialog_body(Cause::RuntimeBroken, &healthy_report());
    assert!(body.contains("Microsoft Edge WebView2 Runtime"));
    assert!(body.contains("Repair"));
    assert!(body.contains("error 0x80070057"));
}

#[test]
fn unwritable_folder_dialog_names_the_folder() {
    let mut report = healthy_report();
    report.data_dir_writable = Some(false);
    let body = dialog_body(Cause::DataFolderUnwritable, &report);
    assert!(body.contains("com.houston.app"));
    assert!(body.contains("contact support"));
}

#[test]
fn missing_runtime_dialog_says_install_even_without_a_code() {
    let mut report = healthy_report();
    report.hresult = None;
    let body = dialog_body(Cause::RuntimeMissing, &report);
    assert!(body.contains("Install it"));
    assert!(body.contains("an unknown error"));
}

#[test]
fn copy_never_leaks_internals() {
    for cause in [
        Cause::RuntimeMissing,
        Cause::DataFolderUnwritable,
        Cause::RuntimeBroken,
    ] {
        let body = dialog_body(cause, &healthy_report());
        for banned in ["tauri", "wry", "HWND", "HRESULT", "controller", "\u{2014}"] {
            assert!(!body.contains(banned), "{banned:?} in {body:?}");
        }
    }
    assert!(
        !DIALOG_TITLE.contains('\u{2014}'),
        "no em dash in user copy"
    );
}

#[test]
fn only_the_runtime_creation_line_counts() {
    assert!(is_webview_creation_error("tauri_runtime_wry", RUNTIME_LINE));
    assert!(!is_webview_creation_error(
        "tauri_runtime_wry",
        "failed to send message"
    ));
    assert!(!is_webview_creation_error("houston_app", RUNTIME_LINE));
}

#[test]
fn writable_probe_leaves_no_file_behind_and_rejects_a_file_as_dir() {
    let dir = std::env::temp_dir().join(format!("houston-webview-probe-{}", std::process::id()));
    probe_writable(&dir).expect("temp dir is writable");
    assert_eq!(std::fs::read_dir(&dir).expect("dir").count(), 0);
    let file = dir.join("not-a-dir");
    std::fs::write(&file, b"x").expect("write");
    assert!(probe_writable(&file).is_err());
    std::fs::remove_dir_all(&dir).expect("cleanup");
}

#[test]
fn recorder_keeps_the_log_bridged_runtime_line_and_ignores_the_rest() {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        let _ = tracing_log::LogTracer::init();
    });
    let subscriber = tracing_subscriber::registry().with(FailureRecorder);
    tracing::subscriber::with_default(subscriber, || {
        log::error!(target: "tauri_runtime_wry", "failed to send message");
        assert_eq!(recorded_failure(), None);
        log::error!(target: "tauri_runtime_wry", "{RUNTIME_LINE}");
    });
    assert_eq!(recorded_failure().as_deref(), Some(RUNTIME_LINE));
}
