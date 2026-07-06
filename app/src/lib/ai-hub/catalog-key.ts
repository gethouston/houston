/**
 * The cross-provider identity key for a model, derived from its display name.
 * A model's key is what folds the same underlying model (e.g. "Claude Opus 4.8"
 * via Anthropic, Bedrock, OpenRouter) into one directory entry.
 *
 * This is the RUNTIME twin of the bake-time `normalizeKey` in
 * `scripts/generate-model-catalog.mjs`: the snapshot's keys are baked with that
 * copy, and a LIVE OpenRouter model must derive the SAME key here so its offer
 * folds onto the matching snapshot model instead of appearing twice. The two
 * MUST stay identical — change one, change the other.
 */

// Leading tokens stripped from a name before it becomes a key: deployment
// regions (Bedrock) and vendor echoes (OpenRouter "Anthropic Claude ...",
// Bedrock "AU Anthropic Claude ..."). Never the trailing model words.
const LEAD_NOISE = new Set(
  (
    "au eu us apac global anthropic openai google meta metallama mistral " +
    "mistralai deepseek qwen alibaba amazon minimax zai moonshotai cohere " +
    "nvidia xai microsoft ai21 perplexity bytedance tencent baidu xiaomi"
  ).split(" "),
);

/**
 * Drops parenthetical/bracketed suffixes ("(latest)", "(EU)", "(Fast)"),
 * collapses punctuation to single spaces (dots kept as version separators),
 * strips leading region/vendor echoes, and drops a trailing "latest" word.
 */
export function normalizeKey(name: string): string {
  let s = String(name || "").toLowerCase();
  s = s.replace(/[([{][^)\]}]*[)\]}]/g, " ");
  s = s.replace(/[^a-z0-9.]+/g, " ");
  s = s.replace(/\s*\.\s*/g, ".").replace(/^\.+|\.+$/g, "");
  const tokens = s.split(/\s+/).filter(Boolean);
  while (tokens.length > 1 && LEAD_NOISE.has(tokens[0])) tokens.shift();
  while (tokens.length > 1 && tokens[tokens.length - 1] === "latest")
    tokens.pop();
  return tokens.join(" ").trim();
}
