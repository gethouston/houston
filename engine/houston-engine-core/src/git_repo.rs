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

/// Seeded `.gitignore`. Keeps volatile machine state, heavy build output, and
/// credentials out of history. Only the `.gitignore` itself is committed at
/// init (see below), but seeding the full set means later mission-boundary
/// commits never sweep in `node_modules/`, `target/`, or a stray `.env` an
/// agent wrote into a project.
const GITIGNORE: &str = "\
# Houston — volatile / machine state (never committed)
**/.houston/sessions/
**/*.sid
**/*.invalid
**/.houston/**/*.schema.json
*-worktrees/
logs/
.DS_Store

# Dependencies, build output, virtualenvs — agents clone + build inside projects
**/node_modules/
**/target/
**/dist/
**/build/
**/.next/
**/.turbo/
**/.venv/
**/venv/
**/__pycache__/

# Secrets — never version-control credentials an agent may write into a project
**/.env
**/.env.*
!**/.env.example
**/*.pem
**/*.key
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

/// True when `child` resolves to a path inside (or equal to) `ancestor`.
/// Canonicalizes both so a symlinked or case-only-different home (macOS
/// `/var` vs `/private/var`, case-insensitive filesystems) is matched
/// correctly; falls back to a lexical check only when canonicalization fails.
fn is_inside(child: &Path, ancestor: &Path) -> bool {
    match (std::fs::canonicalize(child), std::fs::canonicalize(ancestor)) {
        (Ok(c), Ok(a)) => c.starts_with(a),
        _ => child.starts_with(ancestor),
    }
}

/// Ensure the visible workspace root is a git repo. See module docs.
pub fn ensure_docs_root_git(docs_dir: &Path, home_dir: &Path) -> CoreResult<GitInitOutcome> {
    // Create first so the system-root check can canonicalize a real path.
    std::fs::create_dir_all(docs_dir).map_err(|e| {
        CoreError::Internal(format!("create_dir_all({}) failed: {e}", docs_dir.display()))
    })?;

    // The hidden system root (and the legacy `~/.houston/workspaces` default,
    // plus the `~/.dev-houston` debug root) all live under `home_dir`. Those
    // are machine state, never git-backed.
    if is_inside(docs_dir, home_dir) {
        return Ok(GitInitOutcome::SkippedSystemRoot);
    }
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

    // Commit ONLY the `.gitignore`. Never `git add -A` the user's workspace at
    // init: it may hold gigabytes of agent build output or a `.env` an agent
    // wrote into a project, and sweeping all of that into a first commit is
    // both slow and a credential-leak risk. The repo just needs a HEAD; real
    // content is committed later at mission boundaries.
    run_git(docs_dir, &["add", ".gitignore"])?;
    // Per-invocation identity + no signing so the commit succeeds on a machine
    // with no global git config (CI, a fresh non-technical Mac). The `-c` flags
    // do not touch the user's global config.
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
            "Initialize Houston workspace",
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

    fn tracked_files(dir: &Path) -> String {
        let out = Command::new("git")
            .args(["ls-files"])
            .current_dir(dir)
            .output()
            .unwrap();
        String::from_utf8_lossy(&out.stdout).to_string()
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
    fn only_gitignore_is_committed_not_user_content() {
        let tmp = TempDir::new().unwrap();
        let home = tmp.path().join("home");
        let docs = tmp.path().join("Houston");
        std::fs::create_dir_all(&home).unwrap();
        // Pre-existing user content (incl. a secret) must NOT be swept in.
        std::fs::create_dir_all(docs.join("Project")).unwrap();
        std::fs::write(docs.join("Project/.env"), "API_KEY=secret").unwrap();
        std::fs::write(docs.join("Project/huge.bin"), vec![0u8; 1024]).unwrap();

        ensure_docs_root_git(&docs, &home).unwrap();
        let tracked = tracked_files(&docs);
        assert_eq!(tracked.trim(), ".gitignore");
        assert!(!tracked.contains(".env"));
        assert!(!tracked.contains("huge.bin"));
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

    /// The home-skip must survive a symlinked home (the macOS `/var` vs
    /// `/private/var` class of bug), which a lexical `starts_with` would miss.
    #[cfg(unix)]
    #[test]
    fn symlinked_home_is_skipped() {
        let tmp = TempDir::new().unwrap();
        let real_home = tmp.path().join("real_home");
        let docs = real_home.join(".houston").join("workspaces");
        std::fs::create_dir_all(&docs).unwrap();
        let link_home = tmp.path().join("link_home");
        std::os::unix::fs::symlink(&real_home, &link_home).unwrap();

        // home passed as the symlink, docs spelled via the real path.
        let outcome = ensure_docs_root_git(&docs, &link_home).unwrap();
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
