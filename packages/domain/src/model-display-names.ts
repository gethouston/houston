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
    "claude-opus-5": "Opus 5",
    "claude-opus-4-8": "Opus 4.8",
    "claude-opus-4-7": "Opus 4.7",
    "claude-opus-4-6": "Opus 4.6",
    "claude-sonnet-5": "Sonnet 5",
    "claude-sonnet-4-6": "Sonnet 4.6",
    "claude-haiku-4-5": "Haiku 4.5",
  },
  "openai-codex": {
    "gpt-6-astra": "GPT-6 Astra",
    "gpt-5.6-sol": "GPT-5.6 Sol",
    "gpt-5.6-terra": "GPT-5.6 Terra",
    "gpt-5.6-luna": "GPT-5.6 Luna",
    "gpt-5.3-codex-spark": "GPT-5.3 Codex Spark",
    "gpt-5.4-mini": "GPT-5.4 mini",
  },
  // Copilot serves several labs through one plan, so its rows name the lab
  // too — "Sonnet 5" alone would not say whose model it is on that card.
  "github-copilot": {
    "gpt-5.5": "GPT-5.5",
    "gpt-5-mini": "GPT-5 Mini",
    "claude-sonnet-5": "Claude Sonnet 5",
    "claude-opus-4.8": "Claude Opus 4.8",
    "claude-haiku-4.5": "Claude Haiku 4.5",
    "gemini-3.6-flash": "Gemini 3.6 Flash",
  },
  opencode: {
    "claude-sonnet-4-6": "Sonnet 4.6",
    "claude-opus-4-8": "Opus 4.8",
    "gpt-5.5": "GPT-5.5",
    "gemini-3.5-flash": "Gemini 3.5 Flash",
    "mimo-v2.5-free": "MiMo V2.5 (Free)",
    "nemotron-3-ultra-free": "Nemotron 3 Ultra (Free)",
  },
  "opencode-go": {
    "glm-5.1": "GLM-5.1",
    "kimi-k2.6": "Kimi K2.6",
    "minimax-m3": "MiniMax M3",
    "qwen3.7-max": "Qwen3.7 Max",
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
    "deepseek-v4-flash": "DeepSeek V4 Flash",
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
};

/** The curated name for `id`, or undefined for a model with no row. */
export function modelDisplayName(
  provider: ProviderId,
  id: string,
): string | undefined {
  return MODEL_DISPLAY[provider]?.[id];
}

/** Words that read as shouted, not title-cased. */
const ACRONYMS: ReadonlySet<string> = new Set([
  "ai",
  "glm",
  "gpt",
  "llm",
  "moe",
  "oss",
]);

/** A trailing snapshot segment (`…-20250929`) as an ISO date, else null. */
function isoDate(segment: string): string | null {
  const parts = /^(\d{4})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.exec(segment);
  return parts ? `${parts[1]}-${parts[2]}-${parts[3]}` : null;
}

/**
 * Consecutive all-digit segments are ONE version number: model ids spell `4.5`
 * as `4-5`, so splitting on dashes alone would read the version as two words.
 */
function joinVersionRuns(segments: readonly string[]): string[] {
  const out: string[] = [];
  for (const segment of segments) {
    const previous = out[out.length - 1];
    if (
      /^\d+$/.test(segment) &&
      previous !== undefined &&
      /^\d+(\.\d+)*$/.test(previous)
    ) {
      out[out.length - 1] = `${previous}.${segment}`;
      continue;
    }
    out.push(segment);
  }
  return out;
}

function titleCase(word: string): string {
  // Anything starting with a digit is a version or a size ("20b" → "20B").
  if (/^\d/.test(word)) return word.toUpperCase();
  if (ACRONYMS.has(word)) return word.toUpperCase();
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * A readable name derived from a model id, for every id no one curated:
 * `claude-sonnet-4-5-20250929` → "Claude Sonnet 4.5 (2025-09-29)".
 *
 * A gateway's vendor prefix (`anthropic/claude-sonnet-4.6`) is dropped — the
 * name that follows already carries the family, and the row sits under the
 * gateway that serves it. `""` for an empty id: each caller owns its own
 * last-resort copy, which is translated and cannot live in this module.
 */
export function humanizedModelName(id: string): string {
  if (!id) return "";
  const segments = id
    .slice(id.lastIndexOf("/") + 1)
    .split(/[-_]/)
    .filter(Boolean);
  const last = segments[segments.length - 1];
  const date = last === undefined ? null : isoDate(last);
  const name = joinVersionRuns(date ? segments.slice(0, -1) : segments)
    .map(titleCase)
    .join(" ");
  if (!name) return id;
  return date ? `${name} (${date})` : name;
}

/** The name to SHOW for a model: curated when we have one, derived otherwise. */
export function modelLabel(provider: ProviderId, id: string): string {
  return modelDisplayName(provider, id) ?? humanizedModelName(id);
}
