//! Scratch files that carry the per-session system prompt to provider CLIs
//! without putting it on the command line.
//!
//! Windows `CreateProcessW` caps the whole command line at 32,767 chars.
//! Passing the system prompt as an argv token (`-c developer_instructions=…`
//! for codex, `--system-prompt …` for claude) kills the spawn with
//! `ERROR_FILENAME_EXCED_RANGE` (os error 206) once an agent's accumulated
//! context (workspace files, skills index, learnings) crosses that limit —
//! real Windows users hit this (2026-06). The prompt now travels via files
//! each CLI reads natively:
//!
//! - **codex**: a profile config layer at `$CODEX_HOME/<name>.config.toml`
//!   holding `developer_instructions`, selected with `-p <name>`. Requires
//!   the file-based profiles shipped in newer codex CLIs; the bundled pin in
//!   `cli-deps.json` is kept new enough (older codex `-p` only reads
//!   `[profiles.*]` tables out of the user's own `config.toml`).
//! - **claude**: a plain temp file passed via `--system-prompt-file`
//!   (supported by the pinned claude-code 2.1.170).
//!
//! Files are unique per spawn (pid + counter), removed on [`Drop`], and any
//! leftovers from crashes are swept on the first spawn of each engine
//! process. The sweep only touches Houston-named files older than 24 hours
//! so a concurrently running second engine instance never loses live files.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

const SWEEP_MAX_AGE: Duration = Duration::from_secs(24 * 60 * 60);
const CODEX_PROFILE_PREFIX: &str = "houston-tmp-";
const CODEX_PROFILE_SUFFIX: &str = ".config.toml";
const CLAUDE_PROMPT_PREFIX: &str = "houston-claude-sp-";
const CLAUDE_PROMPT_SUFFIX: &str = ".md";

/// A file deleted when the value drops (i.e. when the CLI process is done).
pub(crate) struct ScratchFile {
    path: PathBuf,
}

impl ScratchFile {
    pub(crate) fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for ScratchFile {
    fn drop(&mut self) {
        if let Err(e) = std::fs::remove_file(&self.path) {
            // No UI thread to surface this on; the boot sweep is the backstop.
            tracing::warn!(
                "[prompt-scratch] could not remove {}: {e}",
                self.path.display()
            );
        }
    }
}

/// A codex profile config layer: `$CODEX_HOME/<name>.config.toml`,
/// selected on the codex command line with `-p <name>`.
pub(crate) struct CodexProfile {
    name: String,
    _file: ScratchFile,
}

impl CodexProfile {
    pub(crate) fn name(&self) -> &str {
        &self.name
    }
}

/// `$CODEX_HOME`, falling back to `~/.codex` — the same resolution codex
/// itself uses. Shared with `codex_rollout`'s session scanning.
pub(crate) fn codex_home() -> Option<PathBuf> {
    std::env::var_os("CODEX_HOME")
        .map(PathBuf::from)
        .or_else(|| dirs::home_dir().map(|h| h.join(".codex")))
}

/// Write the system prompt as a codex profile file under `$CODEX_HOME`.
pub(crate) fn codex_profile(system_prompt: &str) -> Result<CodexProfile, String> {
    sweep_once();
    let home = codex_home().ok_or("could not resolve the codex home directory")?;
    codex_profile_in(&home, system_prompt)
}

/// Isolated codex home for API-key backend providers (OpenRouter): a Houston
/// directory that does NOT contain the user's `~/.codex/config.toml`, so codex
/// never loads the user's personal MCP servers or settings into a Houston
/// session. Stable (not per-spawn) so resume + rollout token counts persist
/// across turns. Spawning here also cut a real session's input from ~23k to
/// ~13k tokens (the user's MCP tool-defs were no longer injected into context)
/// and removed the stray MCP auth noise.
pub(crate) fn backend_codex_home() -> PathBuf {
    crate::provider_env::houston_data_root().join("codex-home")
}

/// Like [`codex_profile`] but writes the profile under an explicit codex home
/// (used with [`backend_codex_home`] so the file lands where the spawned codex,
/// pointed at that `CODEX_HOME`, looks for it).
pub(crate) fn codex_profile_at(home: &Path, system_prompt: &str) -> Result<CodexProfile, String> {
    sweep_once();
    codex_profile_in(home, system_prompt)
}

fn codex_profile_in(home: &Path, system_prompt: &str) -> Result<CodexProfile, String> {
    #[derive(Serialize)]
    struct ProfileBody<'a> {
        developer_instructions: &'a str,
    }

    std::fs::create_dir_all(home)
        .map_err(|e| format!("could not create {}: {e}", home.display()))?;
    let name = format!("{CODEX_PROFILE_PREFIX}{}", unique_suffix());
    let path = home.join(format!("{name}{CODEX_PROFILE_SUFFIX}"));
    let body = toml::to_string(&ProfileBody {
        developer_instructions: system_prompt,
    })
    .map_err(|e| format!("could not encode instructions as TOML: {e}"))?;
    std::fs::write(&path, body).map_err(|e| format!("could not write {}: {e}", path.display()))?;
    Ok(CodexProfile {
        name,
        _file: ScratchFile { path },
    })
}

/// Write the system prompt to a temp file for `claude --system-prompt-file`.
pub(crate) fn claude_system_prompt_file(system_prompt: &str) -> Result<ScratchFile, String> {
    sweep_once();
    claude_system_prompt_file_in(&std::env::temp_dir(), system_prompt)
}

fn claude_system_prompt_file_in(dir: &Path, system_prompt: &str) -> Result<ScratchFile, String> {
    let path = dir.join(format!(
        "{CLAUDE_PROMPT_PREFIX}{}{CLAUDE_PROMPT_SUFFIX}",
        unique_suffix()
    ));
    std::fs::write(&path, system_prompt)
        .map_err(|e| format!("could not write {}: {e}", path.display()))?;
    Ok(ScratchFile { path })
}

/// Unique per spawn within this machine: engine pid + process-local counter.
fn unique_suffix() -> String {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    format!(
        "{}-{}",
        std::process::id(),
        COUNTER.fetch_add(1, Ordering::Relaxed)
    )
}

/// Remove crash leftovers, once per engine process.
fn sweep_once() {
    static ONCE: std::sync::Once = std::sync::Once::new();
    ONCE.call_once(|| {
        if let Some(home) = codex_home() {
            sweep_dir(&home, CODEX_PROFILE_PREFIX, CODEX_PROFILE_SUFFIX, SWEEP_MAX_AGE);
        }
        sweep_dir(
            &std::env::temp_dir(),
            CLAUDE_PROMPT_PREFIX,
            CLAUDE_PROMPT_SUFFIX,
            SWEEP_MAX_AGE,
        );
    });
}

fn sweep_dir(dir: &Path, prefix: &str, suffix: &str, max_age: Duration) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let file_name = entry.file_name();
        let Some(name) = file_name.to_str() else {
            continue;
        };
        if !name.starts_with(prefix) || !name.ends_with(suffix) {
            continue;
        }
        let stale = entry
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.elapsed().ok())
            .is_some_and(|age| age >= max_age);
        if stale {
            if let Err(e) = std::fs::remove_file(entry.path()) {
                tracing::warn!(
                    "[prompt-scratch] sweep could not remove {}: {e}",
                    entry.path().display()
                );
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;
    use tempfile::TempDir;

    #[derive(Deserialize)]
    struct ProfileRead {
        developer_instructions: String,
    }

    const NASTY: &str =
        "Line \"one\"\nLine two with 'quotes', a backslash \\, emoji 🚀, tab\there\nand [toml] = trip-ups";

    #[test]
    fn codex_profile_at_writes_under_given_home_and_drop_removes_it() {
        // The backend (OpenRouter) path writes the profile under an isolated
        // home so the spawned codex (CODEX_HOME pointed there) finds it.
        let home = TempDir::new().unwrap();
        let profile = codex_profile_at(home.path(), "hi").unwrap();
        let path = home
            .path()
            .join(format!("{}{CODEX_PROFILE_SUFFIX}", profile.name()));
        assert!(path.exists(), "profile must be written under the given home");
        drop(profile);
        assert!(!path.exists(), "Drop must delete the profile");
    }

    #[test]
    fn codex_profile_roundtrips_arbitrary_prompt_content() {
        let home = TempDir::new().unwrap();
        let profile = codex_profile_in(home.path(), NASTY).unwrap();

        let path = home
            .path()
            .join(format!("{}{CODEX_PROFILE_SUFFIX}", profile.name()));
        let parsed: ProfileRead = toml::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(parsed.developer_instructions, NASTY);
        assert!(profile.name().starts_with(CODEX_PROFILE_PREFIX));
    }

    #[test]
    fn codex_profile_handles_large_prompts() {
        let home = TempDir::new().unwrap();
        let big = "x".repeat(100_000);
        let profile = codex_profile_in(home.path(), &big).unwrap();
        let path = home
            .path()
            .join(format!("{}{CODEX_PROFILE_SUFFIX}", profile.name()));
        let parsed: ProfileRead = toml::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(parsed.developer_instructions.len(), 100_000);
    }

    #[test]
    fn claude_file_roundtrips_and_drop_removes_it() {
        let dir = TempDir::new().unwrap();
        let scratch = claude_system_prompt_file_in(dir.path(), NASTY).unwrap();
        let path = scratch.path().to_path_buf();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), NASTY);

        drop(scratch);
        assert!(!path.exists(), "Drop must delete the scratch file");
    }

    #[test]
    fn drop_removes_codex_profile_file() {
        let home = TempDir::new().unwrap();
        let profile = codex_profile_in(home.path(), "hello").unwrap();
        let path = home
            .path()
            .join(format!("{}{CODEX_PROFILE_SUFFIX}", profile.name()));
        assert!(path.exists());
        drop(profile);
        assert!(!path.exists());
    }

    #[test]
    fn unique_suffix_never_repeats() {
        let a = unique_suffix();
        let b = unique_suffix();
        assert_ne!(a, b);
    }

    #[test]
    fn sweep_removes_only_matching_stale_files() {
        let dir = TempDir::new().unwrap();
        let matching = dir.path().join("houston-tmp-1-1.config.toml");
        let foreign = dir.path().join("my-own-profile.config.toml");
        let wrong_suffix = dir.path().join("houston-tmp-1-2.txt");
        for p in [&matching, &foreign, &wrong_suffix] {
            std::fs::write(p, "x").unwrap();
        }

        // max_age zero: every matching file counts as stale.
        sweep_dir(dir.path(), CODEX_PROFILE_PREFIX, CODEX_PROFILE_SUFFIX, Duration::ZERO);

        assert!(!matching.exists(), "stale houston profile must be swept");
        assert!(foreign.exists(), "user's own profiles must never be touched");
        assert!(wrong_suffix.exists(), "non-profile files must never be touched");
    }

    #[test]
    fn sweep_keeps_fresh_files() {
        let dir = TempDir::new().unwrap();
        let fresh = dir.path().join("houston-tmp-2-1.config.toml");
        std::fs::write(&fresh, "x").unwrap();

        sweep_dir(dir.path(), CODEX_PROFILE_PREFIX, CODEX_PROFILE_SUFFIX, SWEEP_MAX_AGE);

        assert!(fresh.exists(), "files younger than max_age must survive");
    }
}
