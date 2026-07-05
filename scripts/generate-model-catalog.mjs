#!/usr/bin/env node
// Generate app/src/lib/ai-hub/model-catalog.json from https://models.dev/api.json.
//
// A trimmed, deterministic snapshot of the model universe the AI Hub markets.
// Only the providers Houston can actually route to are kept, and only the fields
// the hub renders. Every model gets a baked `key`: a cross-provider normalized
// identity so the same underlying model (e.g. "Claude Opus 4.8" via Anthropic,
// Bedrock, Copilot, OpenCode, OpenRouter) folds into one directory entry.
//
// Re-runnable and deterministic: `node scripts/generate-model-catalog.mjs`.
// Set MODELS_DEV_JSON to a local api.json path for an offline/pinned run.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_URL = "https://models.dev/api.json";
const OUT_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "app",
  "src",
  "lib",
  "ai-hub",
  "model-catalog.json",
);

// Providers Houston connects to. OpenCode Go folds into `opencode` (one key
// serves both gateways), so its models are merged into the opencode bucket.
const KEEP_PROVIDERS = [
  "anthropic",
  "openai",
  "github-copilot",
  "opencode",
  "openrouter",
  "deepseek",
  "google",
  "amazon-bedrock",
  "minimax",
];
const FOLD_INTO = { "opencode-go": "opencode" };

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
 * The cross-provider identity key for a model, derived from its display name.
 * Drops parenthetical/bracketed suffixes ("(latest)", "(EU)", "(Fast)"),
 * collapses punctuation to single spaces (dots kept as version separators),
 * strips leading region/vendor echoes, and drops a trailing "latest" word.
 */
export function normalizeKey(name) {
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

function trimText(text) {
  if (typeof text !== "string") return undefined;
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return undefined;
  // Keep the file small: descriptions are one-liners in the UI.
  return clean.length > 180 ? `${clean.slice(0, 177).trimEnd()}...` : clean;
}

function normalizeModel(raw) {
  const model = {
    key: normalizeKey(raw.name ?? raw.id),
    id: String(raw.id),
    name: String(raw.name ?? raw.id),
  };
  const description = trimText(raw.description);
  if (description) model.description = description;
  if (raw.family) model.family = String(raw.family);
  if (raw.reasoning === true) model.reasoning = true;
  if (raw.tool_call === true) model.toolCall = true;
  if (raw.attachment === true) model.attachment = true;
  if (raw.knowledge) model.knowledge = String(raw.knowledge);
  if (raw.release_date) model.releaseDate = String(raw.release_date);
  const input = raw.modalities?.input;
  if (Array.isArray(input) && input.length)
    model.input = input.map((m) => String(m));
  if (typeof raw.limit?.context === "number") model.context = raw.limit.context;
  if (typeof raw.limit?.output === "number") model.output = raw.limit.output;
  if (typeof raw.cost?.input === "number") model.costIn = raw.cost.input;
  if (typeof raw.cost?.output === "number") model.costOut = raw.cost.output;
  return model;
}

/**
 * Serialize the catalog with one compact model object per line: near-minified
 * size with readable, line-oriented diffs when the snapshot is regenerated.
 */
function serialize(generatedAt, providers) {
  const lines = [
    "{",
    `  "generatedAt": ${JSON.stringify(generatedAt)},`,
    `  "providers": {`,
  ];
  const ids = Object.keys(providers);
  ids.forEach((id, i) => {
    lines.push(`    ${JSON.stringify(id)}: {`, `      "models": [`);
    const models = providers[id].models;
    models.forEach((model, j) => {
      lines.push(
        `        ${JSON.stringify(model)}${j < models.length - 1 ? "," : ""}`,
      );
    });
    lines.push(`      ]`, `    }${i < ids.length - 1 ? "," : ""}`);
  });
  lines.push(`  }`, "}");
  return `${lines.join("\n")}\n`;
}

async function loadSource() {
  const local = process.env.MODELS_DEV_JSON;
  if (local) return JSON.parse(await readFile(local, "utf8"));
  const res = await fetch(SOURCE_URL);
  if (!res.ok)
    throw new Error(
      `Fetch ${SOURCE_URL} failed: ${res.status} ${res.statusText}`,
    );
  return res.json();
}

async function main() {
  const source = await loadSource();

  // Bucket raw models per kept provider (folding opencode-go into opencode).
  const buckets = new Map(KEEP_PROVIDERS.map((id) => [id, new Map()]));
  for (const [providerId, target] of Object.entries(FOLD_INTO)) {
    const provider = source[providerId];
    const bucket = buckets.get(target);
    if (!provider || !bucket) continue;
    for (const raw of Object.values(provider.models ?? {}))
      bucket.set(raw.id, normalizeModel(raw));
  }
  for (const providerId of KEEP_PROVIDERS) {
    const provider = source[providerId];
    const bucket = buckets.get(providerId);
    if (!provider) continue;
    for (const raw of Object.values(provider.models ?? {}))
      bucket.set(raw.id, normalizeModel(raw));
  }

  const providers = {};
  let modelCount = 0;
  for (const providerId of [...buckets.keys()].sort()) {
    const models = [...buckets.get(providerId).values()].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    );
    if (!models.length) continue;
    providers[providerId] = { models };
    modelCount += models.length;
  }

  // Deterministic timestamp: a content hash, not wall-clock, so re-running on
  // the same source produces byte-identical output (clean diffs, no churn).
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(providers))
    .digest("hex")
    .slice(0, 16);
  const json = serialize(`sha256:${fingerprint}`, providers);
  await writeFile(OUT_PATH, json);
  const kb = (Buffer.byteLength(json) / 1024).toFixed(1);
  console.log(
    `Wrote ${OUT_PATH}\n  providers: ${Object.keys(providers).length}  models: ${modelCount}  size: ${kb}KB`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
