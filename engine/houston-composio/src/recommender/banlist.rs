//! Hard-coded ban list shared by both V1.6 (reasoning-first) and the
//! V1.5 retrieval-first fallback. Two reasons an app gets banned:
//!
//! 1. Generic automation orchestrators duplicate Houston's native
//!    routine/scheduler features — recommending them is redundant.
//! 2. Pure LLM API providers are redundant because Houston IS the LLM.
//!    A non-technical user being told to "connect OpenAI to analyze
//!    things" doesn't make sense; the host application already analyzes.
//!
//! The LLM is asked not to suggest these in the prompt; enforcing it in
//! code guarantees the rule even when the model misbehaves.

pub fn is_banned_app(slug: &str) -> bool {
    matches!(
        slug,
        // Orchestrators
        "make"
            | "make_com"
            | "zapier"
            | "n8n"
            | "workato"
            | "pipedream"
            | "ifttt"
            | "integromat"
            | "automatisch"
            | "kit"
            | "promptmate_io"
            | "promptmate"
            // Generic LLM API providers (Houston already is the LLM)
            | "openai"
            | "anthropic"
            | "gemini"
            | "google_ai"
            | "googleai"
            | "cohere"
            | "mistral_ai"
            | "mistralai"
            | "togetherai"
            | "together_ai"
            | "groq"
            | "replicate"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn orchestrators_are_banned() {
        assert!(is_banned_app("make"));
        assert!(is_banned_app("zapier"));
        assert!(is_banned_app("n8n"));
        assert!(is_banned_app("promptmate_io"));
    }

    #[test]
    fn llm_providers_are_banned() {
        assert!(is_banned_app("openai"));
        assert!(is_banned_app("anthropic"));
        assert!(is_banned_app("gemini"));
        assert!(is_banned_app("mistral_ai"));
        assert!(is_banned_app("replicate"));
    }

    #[test]
    fn real_workflow_apps_pass() {
        assert!(!is_banned_app("github"));
        assert!(!is_banned_app("trello"));
        assert!(!is_banned_app("tavily"));
        assert!(!is_banned_app("firecrawl"));
        assert!(!is_banned_app("producthunt"));
        assert!(!is_banned_app("hacker-news"));
    }
}
