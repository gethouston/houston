import Foundation

/// The verbatim model display catalog, ported from `PROVIDERS[].models` in
/// `app/src/lib/providers.ts`. Keyed by the model-namespace id (see
/// `ModelCatalog.namespace`). Labels, descriptions, and effort levels match the
/// desktop source exactly (PARITY §2a — "port verbatim where iOS shows a model
/// picker"). Context windows are intentionally dropped (iOS has no usage
/// indicator). `openai-compatible` is desktop-only and excluded (landmine 8).
enum ModelData {
  static let models: [String: [ModelMeta]] = [
    "openai": [
      .init("gpt-5.5", "GPT-5.5", "OpenAI's frontier model.", [.low, .medium, .high, .xhigh]),
      .init("gpt-5.4", "GPT-5.4", "Strong model for everyday coding.", [.low, .medium, .high, .xhigh]),
      .init("gpt-5.4-mini", "GPT-5.4-Mini", "Small, fast, and cost-efficient for simpler tasks.", [.low, .medium, .high, .xhigh]),
      .init("gpt-5.3-codex-spark", "GPT-5.3-Codex-Spark", "Ultra-fast coding model.", [.low, .medium, .high, .xhigh]),
    ],
    "anthropic": [
      .init("claude-sonnet-5", "Sonnet 5", "Newest Sonnet. Stronger agentic coding and tool use.", [.low, .medium, .high, .xhigh, .max]),
      .init("claude-sonnet-4-6", "Sonnet 4.6", "Best balance of speed and quality.", [.low, .medium, .high, .max]),
      .init("claude-opus-4-8", "Opus 4.8", "Latest Opus. Better alignment and agentic coding than 4.7.", [.low, .medium, .high, .xhigh, .max]),
      .init("claude-fable-5", "Fable 5", "Most capable model. Costs 2x more credits than Opus 4.8.", [.low, .medium, .high, .xhigh, .max]),
      .init("claude-opus-4-7", "Opus 4.7", "Previous flagship. Strong coding autonomy and complex reasoning.", [.low, .medium, .high, .xhigh, .max]),
    ],
    "github-copilot": [
      .init("gpt-4.1", "GPT-4.1", "Available on every plan, including Copilot Free."),
      .init("claude-sonnet-4.6", "Claude Sonnet 4.6", "Best balance of speed and quality. Needs Copilot Pro.", [.low, .medium, .high, .max]),
      .init("claude-opus-4.8", "Claude Opus 4.8", "Anthropic's flagship. Most capable, slower. Needs Copilot Pro.", [.low, .medium, .high, .xhigh, .max]),
      .init("claude-haiku-4.5", "Claude Haiku 4.5", "Anthropic's fastest, for quick tasks. Needs Copilot Pro."),
      .init("gpt-5.5", "GPT-5.5", "OpenAI's frontier model. Needs Copilot Pro.", [.low, .medium, .high, .xhigh]),
      .init("gpt-5-mini", "GPT-5 Mini", "OpenAI's fast, lightweight model. Needs Copilot Pro.", [.low, .medium, .high]),
      .init("gemini-3-flash-preview", "Gemini 3 Flash", "Google's fast model. Needs Copilot Pro.", [.low, .medium, .high]),
    ],
    "opencode": [
      .init("claude-sonnet-4-6", "Sonnet 4.6", "Best balance of speed and quality.", [.low, .medium, .high]),
      .init("claude-opus-4-8", "Opus 4.8", "Most capable Claude, slower.", [.low, .medium, .high, .xhigh]),
      .init("gpt-5.5", "GPT-5.5", "OpenAI's frontier model.", [.low, .medium, .high, .xhigh]),
      .init("gemini-3.5-flash", "Gemini 3.5 Flash", "Fast and capable."),
      .init("deepseek-v4-flash-free", "DeepSeek V4 Flash (Free)", "Fast. Free to try.", [.high, .max]),
      .init("mimo-v2.5-free", "MiMo V2.5 (Free)", "Free to try."),
      .init("nemotron-3-ultra-free", "Nemotron 3 Ultra (Free)", "NVIDIA. Free to try."),
    ],
    "opencode-go": [
      .init("glm-5.1", "GLM-5.1", "Strong open coding model."),
      .init("kimi-k2.6", "Kimi K2.6", "Fast, capable open model."),
      .init("minimax-m3", "MiniMax M3", "Capable open model."),
      .init("qwen3.7-max", "Qwen3.7 Max", "Large open model."),
      .init("deepseek-v4-pro", "DeepSeek V4 Pro", "Strong reasoning.", [.high, .max]),
    ],
    "openrouter": [
      .init("openrouter/free", "Free (auto-routed)", "OpenRouter's free tier. Good for testing, no cost."),
      .init("anthropic/claude-sonnet-4.6", "Claude Sonnet 4.6", "Anthropic's balanced model, via OpenRouter.", [.low, .medium, .high, .max]),
      .init("anthropic/claude-opus-4.8", "Claude Opus 4.8", "Anthropic's flagship, via OpenRouter.", [.low, .medium, .high, .xhigh, .max]),
      .init("google/gemini-3-flash-preview", "Gemini 3 Flash", "Google's fast model, via OpenRouter.", [.low, .medium, .high]),
      .init("deepseek/deepseek-v4-pro", "DeepSeek V4 Pro", "DeepSeek's flagship, via OpenRouter.", [.high, .xhigh]),
    ],
    "deepseek": [
      .init("deepseek-v4-flash", "DeepSeek V4 Flash", "Fast, low-cost DeepSeek model.", [.high, .xhigh]),
      .init("deepseek-v4-pro", "DeepSeek V4 Pro", "DeepSeek's most capable model.", [.high, .xhigh]),
    ],
    "google": [
      .init("gemini-3-flash-preview", "Gemini 3 Flash", "Fast and capable. Best default.", [.low, .medium, .high]),
      .init("gemini-3-pro-preview", "Gemini 3 Pro", "Google's most capable, slower.", [.low, .high]),
      .init("gemini-2.5-flash", "Gemini 2.5 Flash", "Previous fast model.", [.low, .medium, .high]),
      .init("gemini-2.5-pro", "Gemini 2.5 Pro", "Previous flagship.", [.low, .medium, .high]),
    ],
    "amazon-bedrock": [
      .init("anthropic.claude-sonnet-4-6", "Claude Sonnet 4.6", "Anthropic's balanced model, via Bedrock.", [.low, .medium, .high, .xhigh]),
      .init("anthropic.claude-opus-4-8", "Claude Opus 4.8", "Anthropic's flagship, via Bedrock.", [.low, .medium, .high, .xhigh]),
      .init("amazon.nova-pro-v1:0", "Nova Pro", "Amazon's capable general-purpose model."),
      .init("amazon.nova-lite-v1:0", "Nova Lite", "Amazon's fast, lower-cost model."),
    ],
    "minimax": [
      .init("MiniMax-M3", "MiniMax M3", "Best default. Long-context multimodal model.", [.low, .medium, .high]),
      .init("MiniMax-M2.7", "MiniMax M2.7", "Lower cost. Text-only reasoning model.", [.low, .medium, .high]),
      .init("MiniMax-M2.7-highspeed", "MiniMax M2.7 Highspeed", "Faster M2.7 tier for latency-sensitive chats.", [.low, .medium, .high]),
    ],
  ]
}
