import { decodeModelPickerId } from "./chat-model-picker-ids.ts";

export type RunsAsLookup = (provider: string, model: string) => string | null;

export function isModelAllowed(
  allowedModels: readonly string[] | null | undefined,
  provider: string,
  model: string,
  runsAs: RunsAsLookup,
): boolean {
  if (allowedModels == null) return true;
  const target = model.toLowerCase();
  return allowedModels.some(
    (entry) =>
      entry.toLowerCase() === target ||
      (provider !== "" && runsAs(provider, entry)?.toLowerCase() === target),
  );
}

export function runnableEntry(
  provider: string,
  entry: string,
  offers: (provider: string, model: string) => boolean,
  runsAs: RunsAsLookup,
): string | null {
  return runsAs(provider, entry) ?? (offers(provider, entry) ? entry : null);
}

interface PickerRow {
  id: string;
  providerId: string;
}

export function clampPickerToCeiling<
  M extends PickerRow,
  P extends { id: string },
>(
  models: M[],
  providers: P[],
  allowedModels: readonly string[] | null | undefined,
  runsAs: RunsAsLookup,
): { models: M[]; providers: P[] } {
  if (allowedModels == null) return { models, providers };
  const kept = models.filter((row) => {
    const { provider, model } = decodeModelPickerId(row.id);
    return isModelAllowed(allowedModels, provider, model, runsAs);
  });
  const ids = new Set(kept.map((row) => row.providerId));
  return { models: kept, providers: providers.filter((p) => ids.has(p.id)) };
}

export function hiddenModelCount(
  pickerModels: ReadonlyArray<{ id: string }>,
  allowedModels: readonly string[] | null,
  runsAs: RunsAsLookup,
): number {
  if (allowedModels == null) return 0;
  const kept = new Set<string>();
  const all = new Set<string>();
  for (const row of pickerModels) {
    const { provider, model } = decodeModelPickerId(row.id);
    all.add(model);
    if (isModelAllowed(allowedModels, provider, model, runsAs)) kept.add(model);
  }
  return [...all].filter((model) => !kept.has(model)).length;
}
