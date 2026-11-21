import type { ProviderId } from "./provider-ids";

export { humanizedModelName } from "@houston/domain/model-humanized-name";

export const MODEL_DISPLAY: Partial<
  Record<ProviderId, Record<string, string>>
> = {
  anthropic: {
    "claude-fable-5-2": "Fable 5.2",
    "claude-fable-5-1": "Fable 5.1",
    "claude-fable-5": "Fable 5",
    "claude-opus-5-5": "Opus 5.5",
    "claude-opus-5": "Opus 5",
    "claude-opus-4-8": "Opus 4.8",
    "claude-opus-4-7": "Opus 4.7",
    "claude-opus-4-6": "Opus 4.6",
    "claude-sonnet-5-5": "Sonnet 5.5",
    "claude-sonnet-5": "Sonnet 5",
    "claude-sonnet-4-6": "Sonnet 4.6",
    "claude-haiku-5-5": "Haiku 5.5",
    "claude-haiku-4-5": "Haiku 4.5",
  },
  "openai-codex": {
    "gpt-6-luna": "GPT-6 Luna",
    "gpt-6.1-terra": "GPT-6.1 Terra",
    "gpt-6.2-sol": "GPT-6.2 Sol",
    "gpt-6.1-sol": "GPT-6.1 Sol",
    "gpt-6-sol": "GPT-6 Sol",
    "gpt-6.2-astra": "GPT-6.2 Astra",
    "gpt-6-astra": "GPT-6 Astra",
    "gpt-5.6-sol": "GPT-5.6 Sol",
    "gpt-5.6-terra": "GPT-5.6 Terra",
    "gpt-5.6-luna": "GPT-5.6 Luna",
  },
  "github-copilot": {
    "gpt-6-luna": "GPT-6 Luna",
    "gpt-5.6-terra": "GPT-5.6 Terra",
    "claude-sonnet-5": "Claude Sonnet 5",
    "claude-opus-4.8": "Claude Opus 4.8",
    "claude-haiku-4.5": "Claude Haiku 4.5",
    "gemini-3.8-flash": "Gemini 3.8 Flash",
    "gemini-4-neon": "Gemini 4 Neon",
  },
  opencode: {
    "claude-sonnet-4-6": "Sonnet 4.6",
    "claude-opus-4-8": "Opus 4.8",
    "gpt-5.5": "GPT-5.5",
    "gemini-3.5-flash": "Gemini 3.5 Flash",
    "mimo-v2.6-flash-free": "MiMo V2.6 Flash (Free)",
    "nemotron-3.5-super-vl-free": "Nemotron 3.5 Super VL (Free)",
  },
  "opencode-go": {
    "glm-5.3": "GLM-5.3",
    "kimi-k2.7-code": "Kimi K2.7 Code",
    "minimax-m3": "MiniMax M3",
    "qwen3.8-max": "Qwen3.8 Max",
    "deepseek-v4-pro": "DeepSeek V4 Pro",
  },
  openrouter: {
    "openrouter/free": "Free (auto-routed)",
    "anthropic/claude-sonnet-4.6": "Claude Sonnet 4.6",
    "anthropic/claude-opus-4.8": "Claude Opus 4.8",
    "google/gemini-3-flash-preview": "Gemini 3 Flash",
    "deepseek/deepseek-v4-pro": "DeepSeek V4 Pro",
  },
  deepseek: {
    "deepseek-flash": "DeepSeek V4.1 Flash",
    "deepseek-v4-pro": "DeepSeek V4 Pro",
  },
  google: {
    "gemini-3.8-flash": "Gemini 3.8 Flash",
    "gemini-3.7-flash": "Gemini 3.7 Flash",
    "gemini-3.6-flash": "Gemini 3.6 Flash",
    "gemini-3.5-flash": "Gemini 3.5 Flash",
    "gemini-3.5-flash-lite": "Gemini 3.5 Flash Lite",
    "gemini-3.1-flash-lite": "Gemini 3.1 Flash Lite",
    "gemini-4-neon": "Gemini 4 Neon",
    "gemma-4-26b-a4b-it": "Gemma 4 26B A4B IT",
    "gemma-4-31b-it": "Gemma 4 31B IT",
  },
  "amazon-bedrock": {
    "global.anthropic.claude-sonnet-4-6": "Claude Sonnet 4.6",
    "global.anthropic.claude-opus-4-8": "Claude Opus 4.8",
    "amazon.nova-pro-v1:0": "Nova Pro",
    "amazon.nova-lite-v1:0": "Nova Lite",
  },
  minimax: {
    "MiniMax-M3.1-Flash": "MiniMax M3.1 Flash",
    "MiniMax-M3": "MiniMax M3",
  },
  moonshotai: {
    "kimi-k3": "Kimi K3",
  },
  mistral: {
    "mistral-large-4": "Mistral Large 4",
  },
};

export function modelDisplayName(
  provider: ProviderId,
  id: string,
): string | undefined {
  return MODEL_DISPLAY[provider]?.[id];
}
