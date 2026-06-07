use std::ffi::OsString;
use std::path::Path;

use crate::Provider;

const OPENROUTER_DEFAULT_MODEL: &str = "anthropic/claude-sonnet-4";

/// Build `codex exec` args with exec-level flags before the optional
/// `resume` subcommand. Older Codex CLIs reject global flags placed after
/// `resume <id>`.
pub(crate) fn build_args(
    provider: Provider,
    resume_session_id: Option<&str>,
    working_dir: Option<&Path>,
    model: Option<&str>,
    effort: Option<&str>,
    system_prompt: Option<&str>,
) -> Vec<OsString> {
    let mut args = vec![
        OsString::from("exec"),
        OsString::from("--json"),
        OsString::from("--dangerously-bypass-approvals-and-sandbox"),
        OsString::from("--skip-git-repo-check"),
    ];

    if let Some(sp) = system_prompt {
        let json_val = serde_json::to_string(sp).unwrap_or_else(|_| format!("\"{sp}\""));
        args.push(OsString::from("-c"));
        args.push(OsString::from(format!("developer_instructions={json_val}")));
    }

    // Always emit `model_reasoning_effort` so a stale global
    // `~/.codex/config.toml` value can't silently change the effort the
    // engine resolved (or, if it's a variant this codex build can't parse,
    // break the session). The value itself is chosen upstream by
    // `sessions::resolve_effort`.
    if let Some(e) = effort {
        args.push(OsString::from("-c"));
        args.push(OsString::from(format!("model_reasoning_effort=\"{e}\"")));
    }

    if provider.id() == "openrouter" {
        args.extend(openrouter_config_overrides());
    }

    let model_slug = if provider.id() == "openrouter" {
        model.or(Some(OPENROUTER_DEFAULT_MODEL))
    } else {
        model
    };
    if let Some(m) = model_slug {
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

fn openrouter_config_overrides() -> Vec<OsString> {
    [
        r#"model_provider="openrouter""#,
        r#"model_providers.openrouter.name="OpenRouter""#,
        r#"model_providers.openrouter.base_url="https://openrouter.ai/api/v1""#,
        r#"model_providers.openrouter.env_key="OPENROUTER_API_KEY""#,
        r#"model_providers.openrouter.wire_api="responses""#,
    ]
    .into_iter()
    .flat_map(|value| [OsString::from("-c"), OsString::from(value)])
    .collect()
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
    use crate::Provider;
    use std::path::PathBuf;
    use std::str::FromStr;

    fn openai() -> Provider {
        Provider::from_str("openai").unwrap()
    }

    fn openrouter() -> Provider {
        Provider::from_str("openrouter").unwrap()
    }

    fn strings(args: Vec<OsString>) -> Vec<String> {
        args.into_iter()
            .map(|arg| arg.to_string_lossy().to_string())
            .collect()
    }

    #[test]
    fn resume_args_keep_exec_flags_before_subcommand() {
        let dir = PathBuf::from("/tmp/work");
        let args = strings(build_args(
            openai(),
            Some("019dd59b-5e8c-7f63-a8c6-18fb825874ad"),
            Some(&dir),
            Some("gpt-5.5"),
            Some("medium"),
            Some("system"),
        ));

        let resume_pos = args.iter().position(|arg| arg == "resume").unwrap();
        let json_pos = args.iter().position(|arg| arg == "--json").unwrap();
        let cd_pos = args.iter().position(|arg| arg == "--cd").unwrap();

        assert!(json_pos < resume_pos);
        assert!(cd_pos < resume_pos);
        assert_eq!(args[resume_pos + 1], "019dd59b-5e8c-7f63-a8c6-18fb825874ad");
        assert_eq!(args[resume_pos + 2], "-");
    }

    #[test]
    fn fresh_args_read_prompt_from_stdin() {
        let args = strings(build_args(openai(), None, None, None, None, None));

        assert_eq!(args.last().map(String::as_str), Some("-"));
        assert!(!args.iter().any(|arg| arg == "resume"));
    }

    #[test]
    fn effort_emits_model_reasoning_effort_override() {
        let args = strings(build_args(openai(), None, None, None, Some("medium"), None));
        let pos = args
            .iter()
            .position(|arg| arg == "model_reasoning_effort=\"medium\"")
            .expect("effort override should be present");
        // Override must arrive as a `-c key=value` pair.
        assert_eq!(args[pos - 1], "-c");
    }

    #[test]
    fn openrouter_without_model_uses_catalog_default() {
        let args = strings(build_args(openrouter(), None, None, None, None, None));
        let model_pos = args
            .iter()
            .position(|arg| arg == "--model")
            .expect("--model should be present");
        assert_eq!(args[model_pos + 1], "anthropic/claude-sonnet-4");
    }

    #[test]
    fn openrouter_emits_process_local_provider_overrides() {
        let args = strings(build_args(
            openrouter(),
            None,
            None,
            Some("openai/gpt-4o"),
            Some("medium"),
            None,
        ));
        assert!(args.windows(2).any(|pair| {
            pair[0] == "-c" && pair[1] == r#"model_provider="openrouter""#
        }));
        assert!(args.iter().any(|arg| {
            arg == r#"model_providers.openrouter.base_url="https://openrouter.ai/api/v1""#
        }));
        assert!(args.iter().any(|arg| {
            arg == r#"model_providers.openrouter.env_key="OPENROUTER_API_KEY""#
        }));
        assert!(args.iter().any(|arg| {
            arg == r#"model_providers.openrouter.wire_api="responses""#
        }));
    }

    #[test]
    fn openai_args_omit_openrouter_overrides() {
        let args = strings(build_args(openai(), None, None, Some("gpt-5.5"), None, None));
        assert!(!args.iter().any(|arg| arg.contains("openrouter")));
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
