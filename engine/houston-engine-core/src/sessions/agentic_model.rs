//! OpenRouter agentic-tool gate — mirrors `app/src/lib/providers.ts`
//! `modelSupportsAgenticTools`.

use houston_terminal_manager::Provider;

/// OpenRouter slugs marked chat-only in the Houston catalog (`agenticTools:
/// false`). Keep in sync with `app/src/lib/providers.ts`.
const OPENROUTER_CHAT_ONLY: &[&str] = &[
    "openai/gpt-4o-mini",
    "meta-llama/llama-3.3-70b-instruct",
];

/// Curated OpenRouter slugs that complete the Codex Responses tool loop.
/// Unknown slugs are blocked (same as TS: `getModel` miss → not agentic).
/// Keep in sync with `app/src/lib/providers.ts`.
const OPENROUTER_DEFAULT_MODEL: &str = "anthropic/claude-sonnet-4";

const OPENROUTER_AGENTIC: &[&str] = &[
    "anthropic/claude-sonnet-4",
    "openai/gpt-4.1",
    "google/gemini-2.5-flash",
    "google/gemini-2.5-pro",
    "qwen/qwen3-coder-next",
    "mistralai/mistral-large-2512",
    "minimax/minimax-m3",
    "qwen/qwen3-coder:free",
    "google/gemma-3-27b-it:free",
    "mistralai/mistral-small-3.1-24b-instruct:free",
    "deepseek/deepseek-r1-distill-llama-70b:free",
];

fn openrouter_base_slug(model: &str) -> &str {
    model.strip_suffix(":free").unwrap_or(model)
}

fn openrouter_is_chat_only(model: &str) -> bool {
    OPENROUTER_CHAT_ONLY.contains(&model)
        || OPENROUTER_CHAT_ONLY.contains(&openrouter_base_slug(model))
}

fn openrouter_is_agentic(model: &str) -> bool {
    OPENROUTER_AGENTIC.contains(&model)
        || OPENROUTER_AGENTIC.contains(&openrouter_base_slug(model))
}

/// Whether a provider+model can run agent tools under the CLI harness.
pub fn model_supports_agentic_tools(provider: Provider, model: Option<&str>) -> bool {
    if provider.id() != "openrouter" {
        return true;
    }
    let model = model.unwrap_or(OPENROUTER_DEFAULT_MODEL);
    if openrouter_is_chat_only(model) {
        return false;
    }
    openrouter_is_agentic(model)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn openrouter() -> Provider {
        "openrouter".parse().unwrap()
    }
    fn anthropic() -> Provider {
        "anthropic".parse().unwrap()
    }

    #[test]
    fn model_supports_agentic_tools_blocks_chat_only_openrouter_slugs() {
        assert!(!model_supports_agentic_tools(
            openrouter(),
            Some("openai/gpt-4o-mini"),
        ));
        assert!(!model_supports_agentic_tools(
            openrouter(),
            Some("meta-llama/llama-3.3-70b-instruct"),
        ));
        assert!(!model_supports_agentic_tools(
            openrouter(),
            Some("meta-llama/llama-3.3-70b-instruct:free"),
        ));
    }

    #[test]
    fn model_supports_agentic_tools_allows_agentic_openrouter_slugs() {
        assert!(model_supports_agentic_tools(openrouter(), None));
        assert!(model_supports_agentic_tools(
            openrouter(),
            Some("anthropic/claude-sonnet-4"),
        ));
    }

    #[test]
    fn model_supports_agentic_tools_allows_free_openrouter_slugs() {
        assert!(model_supports_agentic_tools(
            openrouter(),
            Some("qwen/qwen3-coder:free"),
        ));
        assert!(model_supports_agentic_tools(
            openrouter(),
            Some("mistralai/mistral-small-3.1-24b-instruct:free"),
        ));
    }

    #[test]
    fn model_supports_agentic_tools_blocks_unknown_openrouter_slug() {
        assert!(!model_supports_agentic_tools(
            openrouter(),
            Some("deepseek/deepseek-v3"),
        ));
    }

    #[test]
    fn model_supports_agentic_tools_non_openrouter_always_allowed() {
        assert!(model_supports_agentic_tools(
            anthropic(),
            Some("claude-sonnet-4-6"),
        ));
        assert!(model_supports_agentic_tools(anthropic(), None));
    }
}
