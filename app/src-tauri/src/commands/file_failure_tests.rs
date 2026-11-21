use super::{
    classify, free_sibling, prepare_download_target, write_with_fallback, FileOpFailureKind,
};
use std::io;

fn tmp_dir(tag: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!(
        "houston-file-failure-{tag}-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    ));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn free_sibling_counts_up_past_taken_names() {
    let dir = tmp_dir("sibling");
    let target = dir.join("report.xlsx");
    assert_eq!(free_sibling(&target), target);
    std::fs::write(&target, b"x").unwrap();
    assert_eq!(free_sibling(&target), dir.join("report (2).xlsx"));
    std::fs::write(dir.join("report (2).xlsx"), b"x").unwrap();
    assert_eq!(free_sibling(&target), dir.join("report (3).xlsx"));
    let dotfile = dir.join(".env");
    std::fs::write(&dotfile, b"x").unwrap();
    assert_eq!(free_sibling(&dotfile), dir.join(".env (2)"));
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn permission_and_disk_full_classify_by_kind() {
    let denied = io::Error::new(io::ErrorKind::PermissionDenied, "Access is denied.");
    assert_eq!(classify(&denied), FileOpFailureKind::Permission);
    let full = io::Error::new(io::ErrorKind::StorageFull, "no space left on device");
    assert_eq!(classify(&full), FileOpFailureKind::DiskFull);
    let gone = io::Error::new(io::ErrorKind::NotFound, "gone");
    assert_eq!(classify(&gone), FileOpFailureKind::Other);
    let other = io::Error::new(io::ErrorKind::InvalidInput, "bad name");
    assert_eq!(classify(&other), FileOpFailureKind::Other);
}

#[cfg(windows)]
#[test]
fn sharing_violation_is_locked() {
    assert_eq!(
        classify(&io::Error::from_raw_os_error(32)),
        FileOpFailureKind::Locked
    );
    assert_eq!(
        classify(&io::Error::from_raw_os_error(33)),
        FileOpFailureKind::Locked
    );
}

#[cfg(unix)]
#[test]
fn epipe_is_not_a_lock_off_windows() {
    assert_ne!(
        classify(&io::Error::from_raw_os_error(32)),
        FileOpFailureKind::Locked
    );
}

#[tokio::test]
async fn plain_write_reports_the_chosen_path() {
    let dir = tmp_dir("plain");
    let target = dir.join("notes.txt");
    let written = write_with_fallback(&target, b"hello").await.unwrap();
    assert_eq!(written.path, target.to_string_lossy());
    assert_eq!(written.file_name, "notes.txt");
    assert_eq!(written.renamed_from, None);
    assert_eq!(std::fs::read(&target).unwrap(), b"hello");
    std::fs::remove_dir_all(dir).unwrap();
}

#[cfg(unix)]
#[tokio::test]
async fn refused_existing_file_lands_beside_it() {
    use std::os::unix::fs::PermissionsExt;
    let dir = tmp_dir("locked");
    let target = dir.join("report.xlsx");
    std::fs::write(&target, b"old").unwrap();
    std::fs::set_permissions(&target, std::fs::Permissions::from_mode(0o444)).unwrap();
    if std::fs::write(&target, b"old").is_ok() {
        return;
    }
    let written = write_with_fallback(&target, b"new").await.unwrap();
    assert_eq!(written.file_name, "report (2).xlsx");
    assert_eq!(written.renamed_from.as_deref(), Some("report.xlsx"));
    assert_eq!(std::fs::read(dir.join("report (2).xlsx")).unwrap(), b"new");
    assert_eq!(std::fs::read(&target).unwrap(), b"old");
    std::fs::set_permissions(&target, std::fs::Permissions::from_mode(0o644)).unwrap();
    std::fs::remove_dir_all(dir).unwrap();
}

#[cfg(unix)]
#[tokio::test]
async fn protected_folder_fails_typed_instead_of_renaming() {
    use std::os::unix::fs::PermissionsExt;
    let dir = tmp_dir("folder");
    std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o555)).unwrap();
    if std::fs::write(dir.join("probe"), b"x").is_ok() {
        return;
    }
    let err = write_with_fallback(&dir.join("report.xlsx"), b"new")
        .await
        .unwrap_err();
    assert_eq!(err.kind, FileOpFailureKind::Permission);
    assert!(
        err.message.starts_with("Failed to save file: "),
        "{}",
        err.message
    );
    std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o755)).unwrap();
    std::fs::remove_dir_all(dir).unwrap();
}

#[tokio::test]
async fn vanished_folder_fails_typed_not_found() {
    let dir = tmp_dir("vanished");
    let target = dir.join("gone").join("report.xlsx");
    let err = write_with_fallback(&target, b"new").await.unwrap_err();
    assert_eq!(err.kind, FileOpFailureKind::NotFound);
    assert!(!target.exists());
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn not_found_crosses_the_wire_snake_case() {
    let json = serde_json::to_string(&FileOpFailureKind::NotFound).unwrap();
    assert_eq!(json, "\"not_found\"");
}

#[cfg(unix)]
#[tokio::test]
async fn not_found_with_the_folder_present_still_reports() {
    let dir = tmp_dir("present");
    let target = dir.join("report.xlsx");
    std::os::unix::fs::symlink(dir.join("missing").join("x"), &target).unwrap();
    let err = write_with_fallback(&target, b"new").await.unwrap_err();
    assert_eq!(err.kind, FileOpFailureKind::Other);
    std::fs::remove_dir_all(dir).unwrap();
}

#[tokio::test]
async fn dialogless_save_creates_a_missing_download_folder() {
    let dir = tmp_dir("downloads").join("Downloads");
    let target = prepare_download_target(&dir, "report.xlsx").await.unwrap();
    assert!(dir.is_dir());
    assert_eq!(target, dir.join("report.xlsx"));
    let written = write_with_fallback(&target, b"new").await.unwrap();
    assert_eq!(written.file_name, "report.xlsx");
    std::fs::remove_dir_all(dir.parent().unwrap()).unwrap();
}

#[tokio::test]
async fn uncreatable_download_folder_is_other_not_not_found() {
    let root = tmp_dir("blocked");
    let dir = root.join("Downloads");
    std::fs::write(&dir, b"x").unwrap();
    let err = prepare_download_target(&dir, "report.xlsx")
        .await
        .unwrap_err();
    assert_eq!(err.kind, FileOpFailureKind::Other);
    std::fs::remove_dir_all(root).unwrap();
}
