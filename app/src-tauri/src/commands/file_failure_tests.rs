use super::{classify, free_sibling, write_with_fallback, FileOpFailureKind};
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
    // A dotfile has no stem to split; the counter goes after the whole name.
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
    let other = io::Error::new(io::ErrorKind::NotFound, "gone");
    assert_eq!(classify(&other), FileOpFailureKind::Other);
}

#[cfg(windows)]
#[test]
fn sharing_violation_is_locked() {
    // The HOUSTON-APP-53A shape: the destination is open in Excel.
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
        return; // root ignores file modes; the refusal can't be staged
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
        return; // root ignores directory modes
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
