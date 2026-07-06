import type {
  LiveCatalog,
  LiveCatalogModel,
  LiveModelCapabilities,
} from "@houston/protocol";

/**
 * Pure, network-free normalizer for OpenRouter's `GET /api/v1/models` payload
 * into the protocol `LiveCatalog`. The upstream is UNTRUSTED third-party JSON,
 * so every field is validated with hand-written guards (the repo has no zod) and
 * a malformed entry is SKIPPED, never thrown — one bad model must not blank the
 * whole picker. Kept side-effect-free so it unit-tests without a fetch.
 */

/** ms in ~30 days — the window a model counts as "new" from its `created` ts. */
const NEW_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** OpenRouter reports per-token USD prices as strings; ×1e6 → per-1M-token. */
const PER_MTOK = 1_000_000;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

/** A finite number, or a numeric string (OpenRouter's price format); else null. */
function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** True when `modalities` (an OpenRouter architecture field) lists "image". */
function hasImage(modalities: unknown): boolean {
  return isStringArray(modalities) && modalities.includes("image");
}

/** Derive the four capability flags from architecture + supported_parameters. */
function capabilities(entry: Record<string, unknown>): LiveModelCapabilities {
  const arch = isObject(entry.architecture) ? entry.architecture : {};
  const params = isStringArray(entry.supported_parameters)
    ? entry.supported_parameters
    : [];
  return {
    vision: hasImage(arch.input_modalities),
    imageGen: hasImage(arch.output_modalities),
    reasoning: params.includes("reasoning"),
    tools: params.includes("tools"),
  };
}

/**
 * Normalize one upstream entry, or `null` when it's too malformed to trust.
 * Required: a non-empty `id` and `name`, plus parseable prompt/completion
 * prices. `now` (injected for testability) drives `isNew`; omit `now` and the
 * flag is left off entirely.
 */
function mapModel(
  raw: unknown,
  now: number | undefined,
): LiveCatalogModel | null {
  if (!isObject(raw)) return null;
  const { id, name } = raw;
  if (typeof id !== "string" || id === "") return null;
  if (typeof name !== "string" || name === "") return null;

  const pricing = isObject(raw.pricing) ? raw.pricing : null;
  const inPrice = pricing ? toNumber(pricing.prompt) : null;
  const outPrice = pricing ? toNumber(pricing.completion) : null;
  if (inPrice === null || outPrice === null) return null;

  const model: LiveCatalogModel = {
    id,
    name,
    pricing: {
      inPerMtok: inPrice * PER_MTOK,
      outPerMtok: outPrice * PER_MTOK,
    },
    capabilities: capabilities(raw),
  };

  if (typeof raw.description === "string" && raw.description !== "")
    model.description = raw.description;

  const ctx = toNumber(raw.context_length);
  if (ctx !== null && ctx > 0) model.contextWindow = ctx;

  // `created` is unix SECONDS. Only decide recency when the caller injected a
  // clock — otherwise the flag is unknowable in a test and stays absent.
  const created = toNumber(raw.created);
  if (now !== undefined && created !== null)
    model.isNew = now - created * 1000 <= NEW_WINDOW_MS;

  return model;
}

/** Pull the model array out of `{ data: [...] }` or a bare array; else `[]`. */
function entriesOf(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (isObject(raw) && Array.isArray(raw.data)) return raw.data;
  return [];
}

/**
 * Map OpenRouter's `/api/v1/models` response to a `LiveCatalog`, dropping any
 * entry that fails validation. `now` (ms since epoch) enables the `isNew` flag;
 * pass `undefined` to leave recency unknown.
 */
export function mapOpenRouterCatalog(raw: unknown, now?: number): LiveCatalog {
  const out: LiveCatalog = [];
  for (const entry of entriesOf(raw)) {
    const model = mapModel(entry, now);
    if (model) out.push(model);
  }
  return out;
}
