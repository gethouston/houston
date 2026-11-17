//! Reads the user's `mimeapps.list`, the file `xdg-mime default` writes.
//!
//! `xdg-mime query default` cannot always confirm a handler that is set:
//! xdg-utils 1.1.3 (Ubuntu 24.04) skips a desktop file whose `Exec=` program
//! fails `which`, and the plugin writes `Exec="/path/houston-app" %u` with
//! quotes. Without desktop-file-utils there is no `mimeinfo.cache` to answer
//! from either, so the query prints nothing while `xdg-open` and GIO route
//! the scheme to us. The entry in this file is what they read.

use std::io::ErrorKind;
use std::path::Path;

/// The first desktop file `path` lists for `mime`. A missing file is no
/// handler, not an error.
pub fn read_default(path: &Path, mime: &str) -> std::io::Result<Option<String>> {
    match std::fs::read_to_string(path) {
        Ok(contents) => Ok(default_for(&contents, mime).map(str::to_owned)),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e),
    }
}

/// First desktop file listed for `mime` under `[Default Applications]`.
/// Repeated groups or keys resolve like GLib's key file: the last one wins.
pub fn default_for<'a>(contents: &'a str, mime: &str) -> Option<&'a str> {
    let mut in_defaults = false;
    let mut found = None;
    for line in contents.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some(group) = line.strip_prefix('[').and_then(|l| l.strip_suffix(']')) {
            in_defaults = group.trim() == "Default Applications";
            continue;
        }
        if !in_defaults {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        if key.trim() == mime {
            found = value.split(';').map(str::trim).find(|v| !v.is_empty());
        }
    }
    found
}

#[cfg(test)]
mod tests {
    use super::*;

    const MIME: &str = "x-scheme-handler/houston";
    const OURS: &str = "houston-app-handler.desktop";

    #[test]
    fn our_file_first() {
        let list = "[Default Applications]\nx-scheme-handler/houston=houston-app-handler.desktop\n";
        assert_eq!(default_for(list, MIME), Some(OURS));
        let with_list = "[Default Applications]\n x-scheme-handler/houston = houston-app-handler.desktop;other.desktop;\n";
        assert_eq!(default_for(with_list, MIME), Some(OURS));
    }

    #[test]
    fn another_app_first_or_ours_second() {
        let other = "[Default Applications]\nx-scheme-handler/houston=other.desktop;\n";
        assert_eq!(default_for(other, MIME), Some("other.desktop"));
        let second = "[Default Applications]\nx-scheme-handler/houston=other.desktop;houston-app-handler.desktop;\n";
        assert_eq!(default_for(second, MIME), Some("other.desktop"));
    }

    #[test]
    fn only_the_default_applications_group_counts() {
        let added = "[Added Associations]\nx-scheme-handler/houston=houston-app-handler.desktop;\n\n[Default Applications]\ntext/html=firefox.desktop\n";
        assert_eq!(default_for(added, MIME), None);
        assert_eq!(default_for("", MIME), None);
        let prefix =
            "[Default Applications]\nx-scheme-handler/houstonx=houston-app-handler.desktop\n";
        assert_eq!(default_for(prefix, MIME), None);
    }

    #[test]
    fn crlf_comments_and_empty_values() {
        let crlf = "# written by hand\r\n[Default Applications]\r\nx-scheme-handler/houston=houston-app-handler.desktop;\r\n";
        assert_eq!(default_for(crlf, MIME), Some(OURS));
        let empty = "[Default Applications]\nx-scheme-handler/houston=;\n";
        assert_eq!(default_for(empty, MIME), None);
    }

    #[test]
    fn a_missing_file_has_no_handler() {
        let dir = std::env::temp_dir().join(format!("houston-mimeapps-{}", std::process::id()));
        let path = dir.join("mimeapps.list");
        assert_eq!(read_default(&path, MIME).ok(), Some(None));
        std::fs::create_dir_all(&dir).expect("temp dir");
        std::fs::write(
            &path,
            "[Default Applications]\r\nx-scheme-handler/houston=houston-app-handler.desktop\r\n",
        )
        .expect("write mimeapps.list");
        let read = read_default(&path, MIME).ok().flatten();
        std::fs::remove_dir_all(&dir).expect("remove temp dir");
        assert_eq!(read.as_deref(), Some(OURS));
    }

    #[test]
    fn the_last_key_wins() {
        let twice = "[Default Applications]\nx-scheme-handler/houston=old.desktop\n[Default Applications]\nx-scheme-handler/houston=houston-app-handler.desktop\n";
        assert_eq!(default_for(twice, MIME), Some(OURS));
    }
}
