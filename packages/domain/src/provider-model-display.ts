/**
 * The name a user SAYS for a model → the id a pin has to carry.
 *
 * The incident: model pins work end to end (a mission pinned to
 * `claude-opus-4-6` really ran on it), but a user asking for "Luna" or "Sonnet"
 * got a mission on the provider's DEFAULT — the assistant sent the provider
 * alone, because nothing anywhere turned a spoken name into an id. Provider
 * names had this ladder already (`provider-choice.ts`); models did not.
 *
 * The names themselves live in `model-display-names.ts`, the ONE table every
 * surface reads, so the name a user sees on screen is the name that resolves
 * here. This module is the spoken half: matching a written phrase against those
 * names, and listing them back in a sentence.
 */

import { MODEL_DISPLAY, modelDisplayName } from "./model-display-names";
import { type ProviderId, VALID_MODELS } from "./provider-model-catalog";

export { MODEL_DISPLAY, modelDisplayName };

/** A model the user named, as this table knows it. */
export interface SpokenModel {
  /** The id the pin must carry. */
  id: string;
  /** The display name that id answers to. */
  name: string;
  /** Whether the spoken name fits several rows and this is the newest of them
   *  — the caller must SAY which one it picked. */
  ambiguous: boolean;
}

/**
 * Resolve a written model NAME ("Luna", "Opus 4.6", "sonnet") to the id it
 * means for `provider`, or null when no row carries that name.
 *
 * Matching is on the display name's words, case- and punctuation-insensitive: a
 * name matches when its words appear, in order and adjacent, in the row's name
 * ("5.4 mini" matches "GPT-5.4 mini"; "luna" matches "GPT-5.6 Luna"). A name
 * that fits several rows takes the FIRST — the newest, by table order — and is
 * flagged so the caller can name what it chose.
 *
 * `offered` narrows the rows to what THIS caller can run (a registry's live
 * model list): a name never resolves to an id the provider does not serve here,
 * so "opus" on a provider that only offers Opus 4.8 lands on Opus 4.8.
 */
export function resolveSpokenModel(
  provider: ProviderId,
  raw: string,
  offered?: readonly string[],
): SpokenModel | null {
  const spoken = words(raw);
  if (!spoken.length) return null;
  const rows = displayRows(provider, offered);
  const exact = rows.find((r) => sameWords(words(r.name), spoken));
  if (exact) return { id: exact.id, name: exact.name, ambiguous: false };
  const matches = rows.filter((r) => hasRun(words(r.name), spoken));
  const first = matches[0];
  if (!first) return null;
  return { id: first.id, name: first.name, ambiguous: matches.length > 1 };
}

/** At most this many models named in one description or rejection — a gateway
 *  catalog runs to hundreds of ids and would drown the sentence around it. */
export const MAX_NAMED_MODELS = 10;

/**
 * `id = Display Name` for every model the caller offers (bare id when it has no
 * spoken name), named rows FIRST so the names a user says survive the cap. Past
 * `limit` the sentence says how many it did not name, never trails off silently.
 */
export function namedModelList(
  provider: ProviderId,
  models: readonly string[],
  limit = MAX_NAMED_MODELS,
): string {
  const named = models.filter((m) => modelDisplayName(provider, m));
  const order = Object.keys(MODEL_DISPLAY[provider] ?? {});
  named.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const ordered = [...named, ...models.filter((m) => !named.includes(m))];
  const shown = ordered
    .slice(0, limit)
    .map((m) => {
      const name = modelDisplayName(provider, m);
      return name ? `${m} = ${name}` : m;
    })
    .join(", ");
  const rest = ordered.length - limit;
  return rest > 0 ? `${shown} (+${rest} more)` : shown;
}

/** The provider's named rows, minus any the provider can no longer run (the
 *  table drifts against pi's catalog; a name must never resolve to a dead id). */
function displayRows(
  provider: ProviderId,
  offered?: readonly string[],
): { id: string; name: string }[] {
  const valid = VALID_MODELS[provider];
  return Object.entries(MODEL_DISPLAY[provider] ?? {})
    .filter(([id]) => !valid || valid.has(id))
    .filter(([id]) => !offered?.length || offered.includes(id))
    .map(([id, name]) => ({ id, name }));
}

/** A display name or a spoken phrase as comparable words ("GPT-5.4 mini" →
 *  ["gpt", "5.4", "mini"]). Dots survive because they carry the version. */
function words(raw: string): string[] {
  return raw
    .toLowerCase()
    .split(/[^a-z0-9.]+/)
    .map((w) => w.replace(/^\.+|\.+$/g, ""))
    .filter(Boolean);
}

function sameWords(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((w, i) => w === b[i]);
}

/** Whether `needle` appears in `hay` as an adjacent, in-order run. */
function hasRun(hay: readonly string[], needle: readonly string[]): boolean {
  if (!needle.length || needle.length > hay.length) return false;
  return hay.some(
    (_, i) =>
      i + needle.length <= hay.length &&
      needle.every((w, j) => hay[i + j] === w),
  );
}
