/**
 * Map a Houston pi model id to the Claude Agent SDK's `model` string.
 *
 * Houston's `anthropic` provider uses the native Anthropic API ids (dash form:
 * `claude-sonnet-4-6`, `claude-opus-4-5`, …) — the exact strings the SDK's
 * `Options.model` accepts, so the common case is a straight pass-through. The
 * table exists for the rare id that needs rewriting (a friendly alias, a renamed
 * model); an unmapped id passes through unchanged rather than being dropped, so a
 * newly released model id keeps working before this table learns about it.
 */
const MODEL_ALIASES: Record<string, string> = {
  // Bare family aliases the SDK also understands, normalized to themselves so a
  // caller passing a shorthand still resolves. Native dash-form ids fall through.
  sonnet: "sonnet",
  opus: "opus",
  haiku: "haiku",
};

/** Resolve a pi model id to the SDK model string (pass-through by default). */
export function toSdkModel(modelId: string): string {
  return MODEL_ALIASES[modelId] ?? modelId;
}
