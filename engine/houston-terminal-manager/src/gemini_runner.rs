//! Gemini CLI session runner — counterpart of `claude_runner` /
//! `codex_runner` for the Google Gemini provider.
//!
//! Spawns `gemini --output-format stream-json -p ...` as a subprocess.
//! The prompt is piped to stdin (matches how claude/codex are run) so
//! we don't have to escape it for the shell. The session id captured
//! from the parser's `init` line is passed back via `--resume <id>` on
//! follow-up turns. See `/tmp/gemini-schema-findings.md` §4.
//!
//! Auth + connectivity: gemini-cli is a Node SEA that REQUIRES network
//! access to the Gemini API. When the API is unreachable it emits a
//! terminal `result {status:"error", error:{type:"GaxiosError"|...}}`
//! which the parser surfaces as a [`FeedItem::ToolRuntimeError`]. No
//! retry logic at this layer — surfaces noisily per the no-silent-
//! failures rule.

use crate::cli_process::run_cli_process;
use crate::gemini_home;
use crate::provider::InstallSource;
use crate::session_update::SessionUpdate;
use crate::types::SessionStatus;
use crate::Provider;
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use tokio::process::Command;
use tokio::sync::mpsc;

/// Spawn a Gemini CLI session.
#[allow(clippy::too_many_arguments)]
pub(crate) async fn spawn_gemini(
    tx: &mpsc::UnboundedSender<SessionUpdate>,
    provider: Provider,
    prompt: String,
    resume_session_id: Option<String>,
    working_dir: Option<PathBuf>,
    model: Option<String>,
    system_prompt: Option<String>,
) {
    tracing::info!(
        "[houston:session] spawning gemini --output-format stream-json (resume={:?}, model={:?})",
        resume_session_id,
        model,
    );

    if let Some(ref dir) = working_dir {
        if !dir.is_dir() {
            let _ = tx.send(SessionUpdate::Status(SessionStatus::Error(format!(
                "Working directory not found: {}. Was it deleted?",
                dir.display()
            ))));
            return;
        }
    }

    // Resolve via the adapter so the same code path covers both the
    // bundled .app/MSI binary and the `gemini` PATH lookup developers
    // rely on in dev mode. When neither exists we must NOT fall through
    // to `Command::new("gemini")` — on Windows that surfaces as the
    // generic "Failed to spawn gemini: program not found" toast, which
    // doesn't tell the user that Gemini is not yet bundled on Windows
    // (see knowledge-base/cli-bundling.md, phase-2 note). Emit a
    // platform-aware error and bail.
    let (install_source, gemini_path) = provider.resolve();
    let bin = match (install_source, gemini_path) {
        (InstallSource::Missing, _) | (_, None) => {
            let _ = tx.send(SessionUpdate::Status(SessionStatus::Error(
                gemini_missing_message().to_string(),
            )));
            return;
        }
        (_, Some(path)) => path,
    };

    let mut cmd = build_gemini_command(
        &bin,
        resume_session_id.as_deref(),
        working_dir.as_deref(),
        model.as_deref(),
    );

    // Override HOME to the Houston-managed runtime directory so the
    // CLI's global memory discovery (`<HOME>/.gemini/GEMINI.md`)
    // finds nothing. Without this the user's accumulated cross-project
    // memories from other tools (Ombra, Alpine.js, ...) leak into
    // every Houston session. Per-agent context is preserved because
    // gemini-cli walks UP from cwd looking for `GEMINI.md`, which
    // `seed_agent` symlinks to `CLAUDE.md` in the agent dir.
    let houston_data = gemini_home::houston_data_root();
    let real_home = match gemini_home::resolve_real_home() {
        Ok(h) => h,
        Err(e) => {
            let _ = tx.send(SessionUpdate::Status(SessionStatus::Error(format!(
                "Failed to resolve home dir for gemini runtime: {e}."
            ))));
            return;
        }
    };
    match gemini_home::ensure_gemini_runtime_home(&houston_data, &real_home) {
        Ok(home) => {
            cmd.env("HOME", &home);
            // On Windows, Node.js consults USERPROFILE in addition to
            // HOMEDRIVE/HOMEPATH for the user's home directory. Mirror
            // the override so memory discovery stays isolated there too.
            #[cfg(windows)]
            cmd.env("USERPROFILE", &home);
        }
        Err(e) => {
            // Surface the failure noisily — silently letting the spawn
            // fall through to the user's real HOME would re-introduce
            // exactly the cross-project memory bleed this isolation
            // exists to prevent. The caller (session_runner) maps the
            // resulting Error status onto a user-visible toast.
            let _ = tx.send(SessionUpdate::Status(SessionStatus::Error(format!(
                "Failed to prepare gemini runtime home: {e}. \
                 Houston cannot spawn gemini safely without it."
            ))));
            return;
        }
    }

    let composed = compose_gemini_prompt(system_prompt.as_deref(), &prompt);
    run_cli_process(tx, &mut cmd, &composed, provider).await;
}

fn build_gemini_command(
    bin: &Path,
    resume_session_id: Option<&str>,
    working_dir: Option<&Path>,
    model: Option<&str>,
) -> Command {
    // The caller resolved `bin` via `provider.resolve()` so this is
    // either the bundled SEA (preferred — we pin the version so the
    // schema in `gemini_parser.rs` matches what gets spawned) or a
    // gemini found on the user's PATH. Old PATH installs that don't
    // recognise `--yolo` / `--skip-trust` will fail visibly in dev mode,
    // which is acceptable because production builds ship the bundled
    // version.
    let mut cmd = Command::new(bin);
    cmd.env("PATH", super::claude_path::shell_path());
    cmd.args(build_gemini_args(resume_session_id, working_dir, model));
    if let Some(dir) = working_dir {
        // Strip the `\\?\` extended-length prefix on Windows for the
        // same reason as the `--include-directories` arg: Node's
        // path-resolution stack inside gemini-cli misparses the prefix.
        // The cwd ends up surfaced to the model as well (gemini emits
        // it back in tool messages) so passing a clean path keeps the
        // whole stack consistent.
        cmd.current_dir(gemini_compatible_path(dir));
    }
    cmd
}

/// Make `path` safe to hand to gemini-cli as a directory argument.
///
/// On Windows, `std::fs::canonicalize` returns the extended-length
/// prefix form (`\\?\C:\Users\...`). Node.js's `fs.realpathSync`
/// (used inside gemini-cli's `WorkspaceContext.resolveAndValidateDir`)
/// chokes on that prefix and crashes with
/// `EISDIR: illegal operation on a directory, lstat 'C:'` — it tries
/// to lstat each path component and parses `C:` as a directory entry
/// rather than the drive letter. Strip the prefix so gemini sees a
/// plain `C:\Users\...` path. UNC variant (`\\?\UNC\server\share`) is
/// rewritten back to the standard UNC form (`\\server\share`).
///
/// No-op on Unix. The kernel never produces the `\\?\` prefix there.
fn gemini_compatible_path(path: &Path) -> PathBuf {
    #[cfg(windows)]
    {
        if let Some(s) = path.to_str() {
            if let Some(rest) = s.strip_prefix(r"\\?\UNC\") {
                return PathBuf::from(format!(r"\\{rest}"));
            }
            if let Some(rest) = s.strip_prefix(r"\\?\") {
                return PathBuf::from(rest);
            }
        }
    }
    path.to_path_buf()
}

/// User-visible explanation when `provider.resolve()` reports the
/// gemini binary is missing. Tailored per platform: Windows has no
/// upstream gemini binary in v1, so users there get a "not yet
/// supported" message; macOS / Linux builds ship the binary inside
/// the bundle and a Missing result means the bundle is broken.
fn gemini_missing_message() -> &'static str {
    if cfg!(windows) {
        "Gemini is not available on Windows yet. Switch to Anthropic or OpenAI \
         for now, or follow Houston's Windows release notes for when Gemini lands."
    } else {
        "Gemini CLI binary missing. Reinstall Houston to restore the bundled CLI."
    }
}

/// Build the argv for `gemini`. Kept pure so it can be unit-tested
/// without spawning a process.
///
/// Order of flags:
/// 1. `--output-format stream-json` — NDJSON event stream this parser
///    expects.
/// 2. `--yolo` — auto-approve every tool invocation. The Houston
///    equivalent of Claude Code's `--dangerously-skip-permissions`. The
///    user has already opted in by spawning a session through Houston;
///    we don't want a CLI prompt blocking the subprocess.
/// 3. `--model <name>` — optional override; otherwise gemini-cli
///    falls back to its built-in default.
/// 4. `--include-directories <cwd>` — when a working dir is set, hint
///    the CLI's filesystem tools at the same root we'll spawn in.
/// 5. `--resume <id>` — when resuming a captured session id from a
///    prior `init` event.
///
/// `-p <prompt>` is intentionally NOT used — we pipe the composed
/// prompt through stdin instead so it survives shell quoting.
/// gemini-cli reads stdin in non-interactive mode.
///
/// **System-prompt note:** gemini-cli v0.42.0 has no flag for system
/// prompts (verified against `packages/cli/src/config/config.ts`).
/// Houston handles its system-prompt slot via [`compose_gemini_prompt`]
/// which wraps the prompt body — not as a CLI argument.
fn build_gemini_args(
    resume_session_id: Option<&str>,
    working_dir: Option<&Path>,
    model: Option<&str>,
) -> Vec<OsString> {
    // `--skip-trust` is REQUIRED. gemini-cli has a "trusted folders"
    // safety check that downgrades `--yolo` and refuses to proceed in
    // untrusted directories, killing the session before any output. The
    // user's workspace folder is Houston-managed and the user already
    // opted into Houston spawning subprocesses there, so the trust check
    // is redundant here. Without `--skip-trust`, every gemini session
    // dies with: "Gemini CLI is not running in a trusted directory."
    let mut args: Vec<OsString> = vec![
        OsString::from("--output-format"),
        OsString::from("stream-json"),
        OsString::from("--yolo"),
        OsString::from("--skip-trust"),
    ];
    if let Some(m) = model {
        args.push(OsString::from("--model"));
        args.push(OsString::from(m));
    }
    if let Some(dir) = working_dir {
        args.push(OsString::from("--include-directories"));
        args.push(gemini_compatible_path(dir).into_os_string());
    }
    if let Some(sid) = resume_session_id {
        args.push(OsString::from("--resume"));
        args.push(OsString::from(sid));
    }
    args
}

/// Compose the prompt body that goes to gemini's stdin. When Houston
/// has a system prompt to inject, wrap it in XML-style tags before the
/// user prompt so the model treats it as instructions rather than
/// dialog. gemini-cli has no `--system` flag in v0.42.0, so this
/// in-prompt injection is the documented workaround.
///
/// The wrapper uses `<system>...</system>` tags — Gemini's training
/// recognizes these as structural separators (same convention Anthropic
/// recommends for Claude when system prompts aren't natively
/// supported). Passes the user prompt through unchanged when no system
/// prompt is configured.
fn compose_gemini_prompt(system_prompt: Option<&str>, user_prompt: &str) -> String {
    match system_prompt.map(str::trim).filter(|s| !s.is_empty()) {
        Some(sp) => format!("<system>\n{sp}\n</system>\n\n{user_prompt}"),
        None => user_prompt.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn strings(args: Vec<OsString>) -> Vec<String> {
        args.into_iter()
            .map(|a| a.to_string_lossy().to_string())
            .collect()
    }

    #[test]
    fn fresh_session_omits_resume() {
        let args = strings(build_gemini_args(None, None, None));
        assert!(args.iter().any(|a| a == "--output-format"));
        assert!(args.iter().any(|a| a == "stream-json"));
        assert!(args.iter().any(|a| a == "--yolo"));
        assert!(args.iter().any(|a| a == "--skip-trust"));
        assert!(!args.iter().any(|a| a == "--resume"));
    }

    #[test]
    fn skip_trust_always_present() {
        // Without --skip-trust, gemini's trusted-folders check downgrades
        // --yolo and exits with "Gemini CLI is not running in a trusted
        // directory." Regression guard.
        for args in [
            build_gemini_args(None, None, None),
            build_gemini_args(Some("sess"), Some(Path::new("/tmp")), Some("m")),
        ] {
            let s = strings(args);
            assert!(
                s.iter().any(|a| a == "--skip-trust"),
                "every gemini spawn must include --skip-trust"
            );
        }
    }

    #[test]
    fn resume_passes_session_id() {
        let args = strings(build_gemini_args(Some("sess-abc"), None, None));
        let pos = args.iter().position(|a| a == "--resume").unwrap();
        assert_eq!(args[pos + 1], "sess-abc");
    }

    #[test]
    fn model_override_emits_flag() {
        let args = strings(build_gemini_args(None, None, Some("gemini-2.5-flash")));
        let pos = args.iter().position(|a| a == "--model").unwrap();
        assert_eq!(args[pos + 1], "gemini-2.5-flash");
    }

    #[test]
    fn working_dir_becomes_include_directories() {
        let dir = PathBuf::from("/tmp/work");
        let args = strings(build_gemini_args(None, Some(&dir), None));
        let pos = args
            .iter()
            .position(|a| a == "--include-directories")
            .unwrap();
        assert_eq!(args[pos + 1], "/tmp/work");
    }

    #[cfg(windows)]
    #[test]
    fn windows_extended_length_prefix_stripped_from_include_directories() {
        // std::fs::canonicalize on Windows returns the `\\?\` prefixed
        // extended-length form. gemini-cli's Node-based
        // `WorkspaceContext.resolveAndValidateDir` crashes on it:
        //   Error: EISDIR: illegal operation on a directory, lstat 'C:'
        // We strip the prefix before handing the path to gemini.
        let dir = PathBuf::from(r"\\?\C:\Users\danie\workspace\agent");
        let args = strings(build_gemini_args(None, Some(&dir), None));
        let pos = args
            .iter()
            .position(|a| a == "--include-directories")
            .unwrap();
        assert_eq!(args[pos + 1], r"C:\Users\danie\workspace\agent");
    }

    #[cfg(windows)]
    #[test]
    fn windows_extended_unc_prefix_normalized() {
        // `\\?\UNC\server\share\path` is the extended-length form of
        // `\\server\share\path`. Same Node parse failure; rewrite back
        // to the standard UNC form.
        let dir = PathBuf::from(r"\\?\UNC\server\share\agent");
        let args = strings(build_gemini_args(None, Some(&dir), None));
        let pos = args
            .iter()
            .position(|a| a == "--include-directories")
            .unwrap();
        assert_eq!(args[pos + 1], r"\\server\share\agent");
    }

    #[cfg(windows)]
    #[test]
    fn windows_plain_path_unchanged() {
        // Only `\\?\` prefixed paths get rewritten — plain `C:\` paths
        // pass through verbatim.
        let dir = PathBuf::from(r"C:\Users\danie\workspace\agent");
        let args = strings(build_gemini_args(None, Some(&dir), None));
        let pos = args
            .iter()
            .position(|a| a == "--include-directories")
            .unwrap();
        assert_eq!(args[pos + 1], r"C:\Users\danie\workspace\agent");
    }

    #[cfg(unix)]
    #[test]
    fn unix_path_unchanged_through_compatibility_helper() {
        // The Windows-only `\\?\` rewrite must be a strict no-op on
        // Unix — the kernel never produces that prefix and any
        // Unix-y path must reach gemini-cli byte-identical.
        let dir = PathBuf::from("/Users/danie/workspace/agent");
        let args = strings(build_gemini_args(None, Some(&dir), None));
        let pos = args
            .iter()
            .position(|a| a == "--include-directories")
            .unwrap();
        assert_eq!(args[pos + 1], "/Users/danie/workspace/agent");
    }

    #[test]
    fn args_never_emit_fictional_system_flag() {
        // gemini-cli v0.42.0 has no --system flag (verified upstream).
        // Houston's system-prompt slot is handled by compose_gemini_prompt,
        // not by an argv entry. Regression guard against re-introducing
        // the bug.
        let args = strings(build_gemini_args(
            Some("x"),
            Some(Path::new("/tmp")),
            Some("m"),
        ));
        assert!(!args.iter().any(|a| a == "--system"));
        assert!(!args.iter().any(|a| a == "--system-prompt"));
    }

    #[test]
    fn yolo_always_present_for_houston_sessions() {
        // Houston manages permission elsewhere; the CLI must never
        // prompt for tool approval inside a Houston session.
        let args = strings(build_gemini_args(
            Some("x"),
            Some(Path::new("/tmp")),
            Some("m"),
        ));
        assert!(args.iter().any(|a| a == "--yolo"));
    }

    #[test]
    fn compose_prompt_passthrough_when_no_system() {
        // Without a system prompt, the user prompt is unchanged.
        assert_eq!(compose_gemini_prompt(None, "hello"), "hello");
    }

    #[test]
    fn compose_prompt_passthrough_when_system_is_empty_or_whitespace() {
        // Empty / whitespace-only system prompts must not produce a
        // pointless `<system></system>` wrapper.
        assert_eq!(compose_gemini_prompt(Some(""), "hello"), "hello");
        assert_eq!(compose_gemini_prompt(Some("   \n  "), "hello"), "hello");
    }

    #[test]
    fn compose_prompt_wraps_system_in_xml_tags() {
        let composed = compose_gemini_prompt(Some("You are a friendly assistant."), "What is 2+2?");
        assert_eq!(
            composed,
            "<system>\nYou are a friendly assistant.\n</system>\n\nWhat is 2+2?",
        );
    }

    #[test]
    fn compose_prompt_preserves_user_prompt_verbatim() {
        // Multi-line user prompts (markdown, code blocks) must pass
        // through unchanged after the system wrapper.
        let user = "first line\n\nsecond paragraph\n\n```python\nprint('hi')\n```";
        let composed = compose_gemini_prompt(Some("sys"), user);
        assert!(composed.ends_with(user));
    }
}
