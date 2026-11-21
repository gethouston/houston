import { MODEL_DISPLAY, modelDisplayName } from "./model-display-names";
import { type ProviderId, VALID_MODELS } from "./provider-model-catalog";

export { MODEL_DISPLAY, modelDisplayName };

export interface SpokenModel {
  id: string;
  name: string;
  ambiguous: boolean;
}

export function resolveSpokenModel(
  provider: ProviderId,
  raw: string,
  offered?: readonly string[],
): SpokenModel | null {
  const spoken = words(raw);
  if (!spoken.length) return null;
  const rows = spokenModelRows(provider, offered);
  const exact = rows.find((r) => sameWords(words(r.name), spoken));
  if (exact) return { id: exact.id, name: exact.name, ambiguous: false };
  const matches = rows.filter((r) => hasRun(words(r.name), spoken));
  const first = matches[0];
  if (!first) return null;
  return { id: first.id, name: first.name, ambiguous: matches.length > 1 };
}

export const MAX_NAMED_MODELS = 10;

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

export function spokenModelRows(
  provider: ProviderId,
  offered?: readonly string[],
): { id: string; name: string }[] {
  const valid = VALID_MODELS[provider];
  return Object.entries(MODEL_DISPLAY[provider] ?? {})
    .filter(([id]) => !valid || valid.has(id))
    .filter(([id]) => !offered?.length || offered.includes(id))
    .map(([id, name]) => ({ id, name }));
}

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

function hasRun(hay: readonly string[], needle: readonly string[]): boolean {
  if (!needle.length || needle.length > hay.length) return false;
  return hay.some(
    (_, i) =>
      i + needle.length <= hay.length &&
      needle.every((w, j) => hay[i + j] === w),
  );
}
