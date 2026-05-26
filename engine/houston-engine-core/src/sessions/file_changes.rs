use crate::agents::files::list_project_files;
use crate::CoreResult;
use houston_terminal_manager::FileChanges;
use std::collections::BTreeMap;
use std::path::Path;
use std::time::UNIX_EPOCH;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileSnapshot {
    files: BTreeMap<String, FileState>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct FileState {
    len: u64,
    modified_ms: Option<u128>,
}

pub fn snapshot(root: &Path) -> CoreResult<FileSnapshot> {
    let mut files = BTreeMap::new();
    for file in list_project_files(root)?
        .into_iter()
        .filter(|file| !file.is_directory)
    {
        let path = root.join(&file.path);
        let state = match std::fs::metadata(&path) {
            Ok(meta) => FileState {
                len: meta.len(),
                modified_ms: meta
                    .modified()
                    .ok()
                    .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
                    .map(|duration| duration.as_millis()),
            },
            Err(_) => continue,
        };
        let absolute = path.to_string_lossy().to_string();
        files.insert(absolute, state);
    }
    Ok(FileSnapshot { files })
}

pub fn diff(before: &FileSnapshot, after: &FileSnapshot) -> FileChanges {
    let mut changes = FileChanges::default();

    for (path, after_state) in &after.files {
        match before.files.get(path) {
            None => changes.created.push(path.clone()),
            Some(before_state) if before_state != after_state => {
                changes.modified.push(path.clone());
            }
            Some(_) => {}
        }
    }

    changes
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    use tempfile::TempDir;

    #[test]
    fn detects_created_user_visible_files_only() {
        let dir = TempDir::new().unwrap();
        let before = snapshot(dir.path()).unwrap();

        std::fs::write(dir.path().join("deck.pptx"), "ppt").unwrap();
        std::fs::write(dir.path().join("make_deck.py"), "print('x')").unwrap();

        let after = snapshot(dir.path()).unwrap();
        let changes = diff(&before, &after);

        assert_eq!(
            changes.created,
            vec![dir.path().join("deck.pptx").to_string_lossy()]
        );
        assert!(changes.modified.is_empty());
    }

    #[test]
    fn markdown_deliverables_tracked_but_role_files_ignored() {
        // Markdown reports are user deliverables and must appear in the
        // chat file-change summary (issue #294). The seeded role files
        // (CLAUDE.md, AGENTS.md, GEMINI.md), created on first run, must
        // NOT — otherwise every agent's first session would falsely
        // report creating its own instructions.
        let dir = TempDir::new().unwrap();
        let before = snapshot(dir.path()).unwrap();

        std::fs::write(dir.path().join("CLAUDE.md"), "role").unwrap();
        std::fs::write(dir.path().join("AGENTS.md"), "role").unwrap();
        std::fs::write(dir.path().join("GEMINI.md"), "role").unwrap();
        std::fs::write(dir.path().join("summary.md"), "# Summary").unwrap();

        let after = snapshot(dir.path()).unwrap();
        let changes = diff(&before, &after);

        assert_eq!(
            changes.created,
            vec![dir.path().join("summary.md").to_string_lossy()]
        );
        assert!(changes.modified.is_empty());
    }

    #[test]
    fn detects_modified_visible_files() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("brief.txt");
        std::fs::write(&path, "first").unwrap();
        let before = snapshot(dir.path()).unwrap();

        std::thread::sleep(Duration::from_millis(5));
        std::fs::write(&path, "second").unwrap();

        let after = snapshot(dir.path()).unwrap();
        let changes = diff(&before, &after);

        assert!(changes.created.is_empty());
        assert_eq!(changes.modified, vec![path.to_string_lossy()]);
    }
}
