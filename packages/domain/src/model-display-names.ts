/**
 * The name a user READS for a model — the ONE table, keyed by pi's CANONICAL
 * provider id.
 *
 * Every surface that names a model reads it here: the chat picker's rows and
 * trigger, the routine screen, the provider-error cards, the assistant's
 * spoken-name ladder (`provider-model-display.ts`) and the mission tools. The
 * app used to carry a second copy on its picker overrides, hand-synced with
 * this one, so the name a user read on screen and the name an agent could
 * resolve were two independently maintained lists.
 *
 * A model with no row here is not nameless: `humanizedModelName` derives a
 * readable name from the id, so a preserved-but-hidden pin (a dated Anthropic
 * snapshot, a gateway id) never reaches the user as a raw string.
 *
 * A dependency-free LEAF (see `provider-dialect.ts`): exposed as the
 * `@houston/domain/model-display-names` subpath and re-exported by
 * `@houston/sdk/provider-catalog`, so surface code loads it under plain
 * `node --experimental-strip-types`, where a barrel's extensionless internal
 * imports do not resolve.
 */

import type { ProviderId } from "./provider-ids";

// Reached through the package's own subpath, not `./model-humanized-name`: an
// extensionless relative specifier does not resolve under plain
// `node --experimental-strip-types` (see `model-aliases.ts`).
export { humanizedModelName } from "@houston/domain/model-humanized-name";

/**
 * `model id → the name the user reads`, per provider, NEWEST FIRST within a
 * family — a bare family name ("opus") resolves to the first row that carries
 * it, so this order IS the "newest of that family" rule
 * (`resolveSpokenModel`).
 *
 * Curated rows only: the models Houston puts in front of a user, plus the ones
 * a user still asks for by name. Every other id a provider serves stays
 * runnable and is named by `humanizedModelName`.
 */
export const MODEL_DISPLAY: Partial<
  Record<ProviderId, Record<string, string>>
> = {
  anthropic: {
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
    "gpt-6.1-sol": "GPT-6.1 Sol",
    "gpt-6-sol": "GPT-6 Sol",
    "gpt-6-astra": "GPT-6 Astra",
    "gpt-5.6-sol": "GPT-5.6 Sol",
    "gpt-5.6-terra": "GPT-5.6 Terra",
    "gpt-5.6-luna": "GPT-5.6 Luna",
  },
  // Copilot serves several labs through one plan, so its rows name the lab
  // too — "Sonnet 5" alone would not say whose model it is on that card.
  "github-copilot": {
    "gpt-6.1-sol": "GPT-6.1 Sol",
    "gpt-6-luna": "GPT-6 Luna",
    "claude-sonnet-5": "Claude Sonnet 5",
    "claude-opus-4.8": "Claude Opus 4.8",
    "claude-haiku-4.5": "Claude Haiku 4.5",
    "gemini-3.8-flash": "Gemini 3.8 Flash",
  },
  opencode: {
    "claude-sonnet-4-6": "Sonnet 4.6",
    "claude-opus-4-8": "Opus 4.8",
    "gpt-5.5": "GPT-5.5",
    "gemini-3.5-flash": "Gemini 3.5 Flash",
    "mimo-v2.6-flash-free": "MiMo V2.6 Flash (Free)",
    "nemotron-3-ultra-free": "Nemotron 3 Ultra (Free)",
  },
  "opencode-go": {
    "glm-5.2": "GLM-5.2",
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
    "MiniMax-M3[1m]": "MiniMax M3 (1M)",
    "MiniMax-M3": "MiniMax M3",
    "MiniMax-M2.7": "MiniMax M2.7",
    "MiniMax-M2.7-highspeed": "MiniMax M2.7 Highspeed",
  },
  moonshotai: {
    "kimi-k3": "Kimi K3",
  },
  mistral: {
    "mistral-large-4": "Mistral Large 4",
  },
};

/** The curated name for `id`, or undefined for a model with no row. */
export function modelDisplayName(
  provider: ProviderId,
  id: string,
): string | undefined {
  return MODEL_DISPLAY[provider]?.[id];
}
