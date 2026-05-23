//! Git inspection — `status`, `log`, `diff` over an arbitrary cwd.
//!
//! Pattern mirrors `worktree.rs`: shells out to the user's installed `git`
//! via `tokio::process::Command`, parses stable porcelain output, and
//! returns structured data. No git library dependency.
//!
//! Powers the `advanced.git_panel` flag (Phase 3 of RFC #248). Engine
//! surface is always-on (per the RFC's enforcement-split table); UI
//! gating happens in `app/src/components/git/git-panel.tsx`.

use crate::error::{CoreError, CoreResult};
use houston_engine_protocol::ErrorCode;
use serde::{Deserialize, Serialize};
use std::path::Path;
use tokio::process::Command;

/// Stable `kind` tag the UI matches on (per `CoreError::Labeled`) to render
/// a "not a git repo" empty state instead of an error toast.
pub const GIT_NOT_A_REPO_KIND: &str = "git_not_a_repo";

const DEFAULT_LOG_LIMIT: u32 = 50;
const MAX_LOG_LIMIT: u32 = 500;

// ─── Requests ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusRequest {
    pub cwd: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitLogRequest {
    pub cwd: String,
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffRequest {
    pub cwd: String,
    /// When set, restrict the diff to one path. When None, diff the whole
    /// working tree against HEAD.
    pub path: Option<String>,
}

// ─── Responses ─────────────────────────────────────────────────────────

/// One file row from `git status --porcelain=v1`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusEntry {
    /// Two-char porcelain code, e.g. `"M "`, `" M"`, `"??"`, `"A "`, `"MM"`.
    pub code: String,
    pub path: String,
    /// Set on rename / copy entries (codes starting with `R` or `C`).
    pub orig_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusResponse {
    pub entries: Vec<GitStatusEntry>,
    /// Current branch name, or None on detached HEAD.
    pub branch: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommit {
    pub sha: String,
    pub author: String,
    /// ISO 8601 (from `%aI`).
    pub date: String,
    pub subject: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitLogResponse {
    pub commits: Vec<GitCommit>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffResponse {
    /// Raw unified diff text. v1 frontend renders with simple +/- coloring;
    /// v2 may parse into hunks for syntax highlighting.
    pub diff: String,
}

// ─── Public API ────────────────────────────────────────────────────────

/// `true` when `cwd` is inside a git working tree.
pub async fn is_repo(cwd: &Path) -> bool {
    run_git(cwd, &["rev-parse", "--git-dir"]).await.is_ok()
}

pub async fn status(req: GitStatusRequest) -> CoreResult<GitStatusResponse> {
    let cwd = Path::new(&req.cwd);
    require_repo(cwd).await?;
    let stdout = run_git(cwd, &["status", "--porcelain=v1", "--branch", "-z"]).await?;
    Ok(parse_status_porcelain_z(&stdout))
}

pub async fn log(req: GitLogRequest) -> CoreResult<GitLogResponse> {
    let cwd = Path::new(&req.cwd);
    require_repo(cwd).await?;
    let limit = req.limit.unwrap_or(DEFAULT_LOG_LIMIT).min(MAX_LOG_LIMIT);
    let n = format!("-n{limit}");
    let stdout = run_git(cwd, &["log", &n, "--pretty=format:%H%x00%an%x00%aI%x00%s"]).await?;
    Ok(GitLogResponse {
        commits: parse_log(&stdout),
    })
}

pub async fn diff(req: GitDiffRequest) -> CoreResult<GitDiffResponse> {
    let cwd = Path::new(&req.cwd);
    require_repo(cwd).await?;
    let mut args: Vec<String> = vec!["diff".into(), "--no-color".into()];
    if let Some(path) = &req.path {
        args.push("--".into());
        args.push(path.clone());
    }
    let args_ref: Vec<&str> = args.iter().map(String::as_str).collect();
    let stdout = run_git(cwd, &args_ref).await?;
    Ok(GitDiffResponse { diff: stdout })
}

// ─── Internals ─────────────────────────────────────────────────────────

async fn require_repo(cwd: &Path) -> CoreResult<()> {
    if !is_repo(cwd).await {
        return Err(CoreError::Labeled {
            code: ErrorCode::BadRequest,
            kind: GIT_NOT_A_REPO_KIND,
            message: format!("not a git repository: {}", cwd.display()),
        });
    }
    Ok(())
}

async fn run_git(cwd: &Path, args: &[&str]) -> CoreResult<String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .await
        .map_err(|e| CoreError::Internal(format!("failed to spawn git: {e}")))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(CoreError::Internal(format!(
            "git {args:?} failed: {stderr}"
        )));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

// ─── Parsers ───────────────────────────────────────────────────────────

/// Parse `git status --porcelain=v1 --branch -z` output.
///
/// Format: optional `"## <branch>...<remote>"` header, then NUL-delimited
/// per-file entries `"XY <path>"` (rename/copy entries are followed by an
/// extra NUL-delimited `<orig_path>`).
fn parse_status_porcelain_z(stdout: &str) -> GitStatusResponse {
    let mut branch = None;
    let mut entries = Vec::new();
    let mut parts = stdout.split('\0');
    while let Some(part) = parts.next() {
        if part.is_empty() {
            continue;
        }
        if let Some(rest) = part.strip_prefix("## ") {
            // Examples seen in the wild:
            //   "main"
            //   "main...origin/main"
            //   "HEAD (no branch)"               -- detached
            //   "No commits yet on main"         -- fresh repo, no HEAD
            let head = rest.split("...").next().unwrap_or(rest).trim();
            let normalized = head
                .strip_prefix("No commits yet on ")
                .unwrap_or(head)
                .to_string();
            branch = Some(normalized);
            continue;
        }
        if part.len() < 3 {
            continue;
        }
        let code = part[0..2].to_string();
        let path = part[3..].to_string();
        let orig_path = if code.starts_with('R') || code.starts_with('C') {
            parts.next().map(String::from)
        } else {
            None
        };
        entries.push(GitStatusEntry {
            code,
            path,
            orig_path,
        });
    }
    GitStatusResponse { entries, branch }
}

/// Parse `git log --pretty=format:%H%x00%an%x00%aI%x00%s` output. One
/// commit per line, four NUL-delimited fields.
fn parse_log(stdout: &str) -> Vec<GitCommit> {
    stdout
        .lines()
        .filter_map(|line| {
            let mut parts = line.split('\0');
            Some(GitCommit {
                sha: parts.next()?.to_string(),
                author: parts.next()?.to_string(),
                date: parts.next()?.to_string(),
                subject: parts.next().unwrap_or("").to_string(),
            })
        })
        .collect()
}

// ─── Tests ─────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_status_handles_branch_and_simple_entries() {
        // Real `git status --porcelain=v1 --branch -z` output (NUL-delimited).
        let input = "## main...origin/main\0 M src/foo.rs\0?? new.txt\0M  staged.rs\0";
        let parsed = parse_status_porcelain_z(input);
        assert_eq!(parsed.branch.as_deref(), Some("main"));
        assert_eq!(parsed.entries.len(), 3);
        assert_eq!(parsed.entries[0].code, " M");
        assert_eq!(parsed.entries[0].path, "src/foo.rs");
        assert_eq!(parsed.entries[1].code, "??");
        assert_eq!(parsed.entries[1].path, "new.txt");
        assert_eq!(parsed.entries[2].code, "M ");
        assert_eq!(parsed.entries[2].path, "staged.rs");
    }

    #[test]
    fn parse_status_handles_rename_orig_path() {
        // Rename entry: code "R " + new path, followed by NUL + orig path.
        let input = "## feature/x\0R  newname.rs\0oldname.rs\0?? unrelated\0";
        let parsed = parse_status_porcelain_z(input);
        assert_eq!(parsed.entries.len(), 2);
        assert_eq!(parsed.entries[0].code, "R ");
        assert_eq!(parsed.entries[0].path, "newname.rs");
        assert_eq!(parsed.entries[0].orig_path.as_deref(), Some("oldname.rs"));
        assert_eq!(parsed.entries[1].path, "unrelated");
    }

    #[test]
    fn parse_status_detached_head() {
        // HEAD line without a branch — branch field becomes the raw text.
        let input = "## HEAD (no branch)\0 M foo\0";
        let parsed = parse_status_porcelain_z(input);
        assert_eq!(parsed.branch.as_deref(), Some("HEAD (no branch)"));
        assert_eq!(parsed.entries.len(), 1);
    }

    #[test]
    fn parse_status_fresh_repo_no_commits() {
        // `git status --branch -z` on a freshly-init'd repo with no
        // commits emits "## No commits yet on <branch>" instead of
        // "## <branch>". Strip the prefix so the UI gets a usable name.
        let input = "## No commits yet on main\0";
        let parsed = parse_status_porcelain_z(input);
        assert_eq!(parsed.branch.as_deref(), Some("main"));
        assert!(parsed.entries.is_empty());
    }

    #[test]
    fn parse_log_three_commits() {
        let input = "abc123\0Carlos\02026-05-22T10:00:00-05:00\0first commit\n\
                     def456\0Alice\02026-05-21T09:00:00-05:00\0second commit with: colons & symbols\n\
                     fed789\0Bob\02026-05-20T08:00:00-05:00\0third";
        let parsed = parse_log(input);
        assert_eq!(parsed.len(), 3);
        assert_eq!(parsed[0].sha, "abc123");
        assert_eq!(parsed[0].author, "Carlos");
        assert_eq!(parsed[0].date, "2026-05-22T10:00:00-05:00");
        assert_eq!(parsed[0].subject, "first commit");
        assert_eq!(parsed[1].subject, "second commit with: colons & symbols");
        assert_eq!(parsed[2].sha, "fed789");
    }

    #[test]
    fn parse_log_empty_input_yields_empty_vec() {
        assert_eq!(parse_log(""), vec![]);
    }

    // ─── Integration tests against a real `git` binary ─────────────────
    //
    // CI's ubuntu-latest runners ship git; macOS dev too. The tempdir
    // approach avoids any shared global state.

    use std::process::Command as StdCommand;
    use tempfile::TempDir;

    async fn init_repo() -> TempDir {
        let dir = TempDir::new().expect("tempdir");
        // Use blocking std::Command for the synchronous setup — keeps the
        // test setup linear and obvious.
        let git = |args: &[&str]| {
            let out = StdCommand::new("git")
                .args(args)
                .current_dir(dir.path())
                .output()
                .expect("spawn git");
            assert!(
                out.status.success(),
                "git {args:?} failed: {}",
                String::from_utf8_lossy(&out.stderr)
            );
        };
        git(&["init", "-q"]);
        git(&["config", "user.email", "test@example.com"]);
        git(&["config", "user.name", "Test User"]);
        git(&["config", "commit.gpgsign", "false"]);
        // Force a stable initial branch name regardless of the user's
        // global `init.defaultBranch` setting.
        git(&["checkout", "-q", "-b", "main"]);
        dir
    }

    #[tokio::test]
    async fn is_repo_true_in_initialized_dir() {
        let dir = init_repo().await;
        assert!(is_repo(dir.path()).await);
    }

    #[tokio::test]
    async fn is_repo_false_in_plain_tempdir() {
        let dir = TempDir::new().expect("tempdir");
        assert!(!is_repo(dir.path()).await);
    }

    #[tokio::test]
    async fn status_against_non_repo_returns_labeled_error() {
        let dir = TempDir::new().expect("tempdir");
        let err = status(GitStatusRequest {
            cwd: dir.path().to_string_lossy().to_string(),
        })
        .await
        .unwrap_err();
        assert_eq!(err.kind(), Some(GIT_NOT_A_REPO_KIND));
        assert_eq!(err.code(), ErrorCode::BadRequest);
    }

    #[tokio::test]
    async fn status_against_clean_repo_returns_branch_only() {
        let dir = init_repo().await;
        // A freshly-`git init`'d repo with no commits and no working-tree
        // files has nothing to report — porcelain output is empty and the
        // `## main` branch line is the only thing emitted.
        let res = status(GitStatusRequest {
            cwd: dir.path().to_string_lossy().to_string(),
        })
        .await
        .expect("status ok");
        assert_eq!(res.branch.as_deref(), Some("main"));
        assert!(
            res.entries.is_empty(),
            "expected no entries, got {:?}",
            res.entries
        );
    }

    #[tokio::test]
    async fn status_reports_modified_and_untracked() {
        let dir = init_repo().await;
        // Seed a committed file + a fresh untracked file + a modification.
        std::fs::write(dir.path().join("tracked.txt"), "v1\n").unwrap();
        StdCommand::new("git")
            .args(["add", "tracked.txt"])
            .current_dir(dir.path())
            .output()
            .unwrap();
        StdCommand::new("git")
            .args(["commit", "-q", "-m", "seed"])
            .current_dir(dir.path())
            .output()
            .unwrap();
        std::fs::write(dir.path().join("tracked.txt"), "v2\n").unwrap();
        std::fs::write(dir.path().join("new.txt"), "hello\n").unwrap();

        let res = status(GitStatusRequest {
            cwd: dir.path().to_string_lossy().to_string(),
        })
        .await
        .expect("status ok");

        assert_eq!(res.branch.as_deref(), Some("main"));
        let codes: Vec<&str> = res.entries.iter().map(|e| e.code.as_str()).collect();
        assert!(codes.contains(&" M"), "missing modified, got {codes:?}");
        assert!(codes.contains(&"??"), "missing untracked, got {codes:?}");
    }

    #[tokio::test]
    async fn log_returns_committed_history() {
        let dir = init_repo().await;
        std::fs::write(dir.path().join("a.txt"), "1\n").unwrap();
        StdCommand::new("git")
            .args(["add", "a.txt"])
            .current_dir(dir.path())
            .output()
            .unwrap();
        StdCommand::new("git")
            .args(["commit", "-q", "-m", "first"])
            .current_dir(dir.path())
            .output()
            .unwrap();

        let res = log(GitLogRequest {
            cwd: dir.path().to_string_lossy().to_string(),
            limit: None,
        })
        .await
        .expect("log ok");
        assert_eq!(res.commits.len(), 1);
        assert_eq!(res.commits[0].author, "Test User");
        assert_eq!(res.commits[0].subject, "first");
    }
}
