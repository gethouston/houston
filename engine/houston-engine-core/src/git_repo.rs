//! Git-init the user-visible Houston workspace root.
//!
//! The visible, user-named root (`docs_dir`, e.g. `~/Houston`) is a git
//! repository so the user gets version history of everything they and their
//! agents create. The hidden system root (`~/.houston`, `~/.dev-houston`) is
//! never a repo — it holds machine state, not user work — so git-init is
//! skipped whenever `docs_dir` lives inside `home_dir` (which also covers the
//! legacy `~/.houston/workspaces` default).
//!
//! Idempotent + boot-safe: a missing `git` degrades to a logged skip rather
//! than failing engine startup. The app's onboarding surfaces git availability
//! to the user; there is no UI thread at engine boot.

use crate::error::{CoreError, CoreResult};
use std::path::Path;
use std::process::Command;

/// Seeded `.gitignore` — keep volatile / machine state out of history.
const GITIGNORE: &str = "\
# Houston — volatile / machine state (never committed)
**/.houston/sessions/
**/*.sid
**/*.invalid
**/.houston/**/*.schema.json
*-worktrees/
logs/
.DS_Store
";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GitInitOutcome {
    /// Freshly initialized a repo + seeded `.gitignore` + initial commit.
    Initialized,
    /// `docs_dir` already contained a `.git` — nothing to do.
    AlreadyRepo,
    /// `docs_dir` is inside the hidden system root — intentionally not a repo.
    SkippedSystemRoot,
    /// `git` is not on PATH — degraded gracefully.
    SkippedNoGit,
}

fn git_available() -> bool {
    Command::new("git")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn run_git(dir: &Path, args: &[&str]) -> CoreResult<()> {
    let output = Command::new("git")
        .args(args)
        .current_dir(dir)
        .output()
        .map_err(|e| CoreError::Internal(format!("git {args:?} failed to spawn: {e}")))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(CoreError::Internal(format!("git {args:?} failed: {stderr}")));
    }
    Ok(())
}

/// Ensure the visible workspace root is a git repo. See module docs.
pub fn ensure_docs_root_git(docs_dir: &Path, home_dir: &Path) -> CoreResult<GitInitOutcome> {
    // The hidden system root (and the legacy `~/.houston/workspaces` default,
    // plus the `~/.dev-houston` debug root) all live under `home_dir`. Those
    // are machine state, never git-backed.
    if docs_dir.starts_with(home_dir) {
        return Ok(GitInitOutcome::SkippedSystemRoot);
    }
    std::fs::create_dir_all(docs_dir).map_err(|e| {
        CoreError::Internal(format!("create_dir_all({}) failed: {e}", docs_dir.display()))
    })?;
    if docs_dir.join(".git").exists() {
        return Ok(GitInitOutcome::AlreadyRepo);
    }
    if !git_available() {
        tracing::warn!(
            "[git] git not found on PATH — {} will not be version-controlled until git is installed",
            docs_dir.display()
        );
        return Ok(GitInitOutcome::SkippedNoGit);
    }

    run_git(docs_dir, &["init", "-b", "main"])?;

    let gitignore = docs_dir.join(".gitignore");
    if !gitignore.exists() {
        std::fs::write(&gitignore, GITIGNORE)
            .map_err(|e| CoreError::Internal(format!("write .gitignore failed: {e}")))?;
    }

    run_git(docs_dir, &["add", "-A"])?;
    // Per-invocation identity + no signing so the initial commit succeeds on a
    // machine with no global git config (CI, a fresh non-technical Mac). The
    // `-c` flags do not touch the user's global config.
    run_git(
        docs_dir,
        &[
            "-c",
            "user.name=Houston",
            "-c",
            "user.email=houston@localhost",
            "-c",
            "commit.gpgsign=false",
            "commit",
            "-m",
            "Initial Houston workspace",
        ],
    )?;

    Ok(GitInitOutcome::Initialized)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn is_git_repo(dir: &Path) -> bool {
        dir.join(".git").is_dir()
    }

    #[test]
    fn visible_root_is_initialized() {
        let tmp = TempDir::new().unwrap();
        let home = tmp.path().join("home");
        let docs = tmp.path().join("Houston");
        std::fs::create_dir_all(&home).unwrap();
        let outcome = ensure_docs_root_git(&docs, &home).unwrap();
        assert_eq!(outcome, GitInitOutcome::Initialized);
        assert!(is_git_repo(&docs));
        assert!(docs.join(".gitignore").is_file());
    }

    #[test]
    fn second_call_is_idempotent() {
        let tmp = TempDir::new().unwrap();
        let home = tmp.path().join("home");
        let docs = tmp.path().join("Houston");
        std::fs::create_dir_all(&home).unwrap();
        assert_eq!(
            ensure_docs_root_git(&docs, &home).unwrap(),
            GitInitOutcome::Initialized
        );
        assert_eq!(
            ensure_docs_root_git(&docs, &home).unwrap(),
            GitInitOutcome::AlreadyRepo
        );
    }

    #[test]
    fn system_root_is_skipped() {
        let tmp = TempDir::new().unwrap();
        let home = tmp.path().join(".houston");
        let docs = home.join("workspaces");
        std::fs::create_dir_all(&docs).unwrap();
        let outcome = ensure_docs_root_git(&docs, &home).unwrap();
        assert_eq!(outcome, GitInitOutcome::SkippedSystemRoot);
        assert!(!is_git_repo(&docs));
    }

    #[test]
    fn initial_commit_establishes_head() {
        let tmp = TempDir::new().unwrap();
        let home = tmp.path().join("home");
        let docs = tmp.path().join("Houston");
        std::fs::create_dir_all(&home).unwrap();
        ensure_docs_root_git(&docs, &home).unwrap();
        let out = Command::new("git")
            .args(["rev-parse", "HEAD"])
            .current_dir(&docs)
            .output()
            .unwrap();
        assert!(out.status.success(), "HEAD should resolve after initial commit");
    }
}
