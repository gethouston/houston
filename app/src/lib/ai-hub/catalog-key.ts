const LEAD_NOISE = new Set(
  (
    "au eu us apac global anthropic openai google meta metallama mistral " +
    "mistralai deepseek qwen alibaba amazon minimax zai moonshotai cohere " +
    "nvidia xai microsoft ai21 perplexity bytedance tencent baidu xiaomi"
  ).split(" "),
);

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
