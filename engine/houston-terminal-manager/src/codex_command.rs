use std::ffi::OsString;
use std::path::Path;

/// Build `codex exec` args with exec-level flags before the optional
/// `resume` subcommand. Older Codex CLIs reject global flags placed after
/// `resume <id>`.
///
/// The system prompt is deliberately NOT an argv token. It used to ride as
/// `-c developer_instructions=<json>`, which put the whole prompt on the
/// command line and blew past Windows' 32,767-char `CreateProcessW` limit
/// (os error 206) for agents with large accumulated context. It now lives
/// in a profile file (`prompt_scratch::codex_profile`) selected here by
/// name via `-p`.
pub(crate) fn build_args(
    resume_session_id: Option<&str>,
    working_dir: Option<&Path>,
    model: Option<&str>,
    effort: Option<&str>,
    profile: Option<&str>,
) -> Vec<OsString> {
    let mut args = vec![
        OsString::from("exec"),
        OsString::from("--json"),
        OsString::from("--dangerously-bypass-approvals-and-sandbox"),
        OsString::from("--skip-git-repo-check"),
    ];

    if let Some(name) = profile {
        args.push(OsString::from("-p"));
        args.push(OsString::from(name));
    }

    // Always emit `model_reasoning_effort` so a stale global
    // `~/.codex/config.toml` value can't silently change the effort the
    // engine resolved (or, if it's a variant this codex build can't parse,
    // break the session). The value itself is chosen upstream by
    // `sessions::resolve_effort`. It stays a `-c` override (not part of the
    // profile file) because `-c` has the highest config precedence — it
    // wins even over the profile layer.
    if let Some(e) = effort {
        args.push(OsString::from("-c"));
        args.push(OsString::from(format!("model_reasoning_effort=\"{e}\"")));
    }

    if let Some(m) = model {
        args.push(OsString::from("--model"));
        args.push(OsString::from(m));
    }

    if let Some(dir) = working_dir {
        args.push(OsString::from("--cd"));
        args.push(dir.as_os_str().to_os_string());
    }

    if let Some(session_id) = resume_session_id {
        args.push(OsString::from("resume"));
        args.push(OsString::from(session_id));
    }
    args.push(OsString::from("-"));

    args
}

pub(crate) fn is_missing_rollout_error(line: &str) -> bool {
    let lower = line.to_lowercase();
    lower.contains("thread/resume")
        && lower.contains("no rollout found")
        && lower.contains("thread id")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn strings(args: Vec<OsString>) -> Vec<String> {
        args.into_iter()
            .map(|arg| arg.to_string_lossy().to_string())
            .collect()
    }

    #[test]
    fn resume_args_keep_exec_flags_before_subcommand() {
        let dir = PathBuf::from("/tmp/work");
        let args = strings(build_args(
            Some("019dd59b-5e8c-7f63-a8c6-18fb825874ad"),
            Some(&dir),
            Some("gpt-5.5"),
            Some("medium"),
            Some("houston-tmp-1-1"),
        ));

        let resume_pos = args.iter().position(|arg| arg == "resume").unwrap();
        let json_pos = args.iter().position(|arg| arg == "--json").unwrap();
        let cd_pos = args.iter().position(|arg| arg == "--cd").unwrap();
        let profile_pos = args.iter().position(|arg| arg == "-p").unwrap();

        assert!(json_pos < resume_pos);
        assert!(cd_pos < resume_pos);
        assert!(profile_pos < resume_pos);
        assert_eq!(args[profile_pos + 1], "houston-tmp-1-1");
        assert_eq!(args[resume_pos + 1], "019dd59b-5e8c-7f63-a8c6-18fb825874ad");
        assert_eq!(args[resume_pos + 2], "-");
    }

    /// The whole point of the profile indirection: argv stays small and
    /// constant no matter how large the agent's system prompt grows, so the
    /// Windows 32,767-char command-line limit can never kill the spawn again.
    #[test]
    fn argv_length_is_independent_of_prompt_size() {
        let args = strings(build_args(
            None,
            None,
            Some("gpt-5.5"),
            Some("high"),
            Some("houston-tmp-9999-9999"),
        ));
        let total: usize = args.iter().map(|a| a.len() + 1).sum();
        assert!(
            total < 1_000,
            "codex argv must stay tiny, got {total} chars: {args:?}"
        );
        assert!(
            !args.iter().any(|a| a.contains("developer_instructions")),
            "system prompt must never ride on argv"
        );
    }

    #[test]
    fn fresh_args_read_prompt_from_stdin() {
        let args = strings(build_args(None, None, None, None, None));

        assert_eq!(args.last().map(String::as_str), Some("-"));
        assert!(!args.iter().any(|arg| arg == "resume"));
    }

    #[test]
    fn effort_emits_model_reasoning_effort_override() {
        let args = strings(build_args(None, None, None, Some("medium"), None));
        let pos = args
            .iter()
            .position(|arg| arg == "model_reasoning_effort=\"medium\"")
            .expect("effort override should be present");
        // Override must arrive as a `-c key=value` pair.
        assert_eq!(args[pos - 1], "-c");
    }

    #[test]
    fn detects_codex_missing_rollout_error() {
        assert!(is_missing_rollout_error(
            "Error: thread/resume: thread/resume failed: no rollout found for thread id 1088f5a4-c484-44d4-b594-585b74a8f859"
        ));
        assert!(!is_missing_rollout_error(
            "unexpected status 401 Unauthorized"
        ));
    }
}
