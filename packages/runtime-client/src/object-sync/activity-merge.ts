import { isDeepStrictEqual } from "node:util";

export const ACTIVITY_DOC = ".houston/activity/activity.json";

type Card = Record<string, unknown>;

function isCard(value: unknown): value is Card {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cardId(value: unknown): string | undefined {
  return isCard(value) && typeof value.id === "string" ? value.id : undefined;
}

function byId(items: readonly unknown[]): Map<string, Card> {
  const out = new Map<string, Card>();
  for (const item of items) {
    const id = cardId(item);
    if (id !== undefined && isCard(item)) out.set(id, item);
  }
  return out;
}

function updatedAt(card: Card): number {
  const value = card.updated_at;
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function mergeCardFields(base: Card, local: Card, remote: Card): Card {
  const merged: Card = {};
  const keys = new Set([
    ...Object.keys(remote),
    ...Object.keys(local),
    ...Object.keys(base),
  ]);
  for (const key of keys) {
    const localChanged = !isDeepStrictEqual(local[key], base[key]);
    const remoteChanged = !isDeepStrictEqual(remote[key], base[key]);
    const value = localChanged && !remoteChanged ? local[key] : remote[key];
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}

function pickNewer(local: Card, remote: Card): Card {
  return updatedAt(local) > updatedAt(remote) ? local : remote;
}

function resolveCard(
  base: Card | undefined,
  local: Card | undefined,
  remote: Card | undefined,
): Card | undefined {
  if (local && remote) {
    if (base) return mergeCardFields(base, local, remote);
    return pickNewer(local, remote);
  }
  if (local) {
    return base ? undefined : local;
  }
  if (remote) {
    if (base && isDeepStrictEqual(base, remote)) return undefined;
    return remote;
  }
  return undefined;
}

export function mergeActivityArrays(
  remote: readonly unknown[],
  local: readonly unknown[],
  base?: readonly unknown[],
): unknown[] {
  const baseCards = base ? byId(base) : new Map<string, Card>();
  const localCards = byId(local);
  const remoteCards = byId(remote);
  const order = [...remoteCards.keys()];
  for (const id of localCards.keys()) {
    if (!remoteCards.has(id)) order.push(id);
  }
  const merged: unknown[] = [];
  for (const id of order) {
    const card = resolveCard(
      baseCards.get(id),
      localCards.get(id),
      remoteCards.get(id),
    );
    if (card) merged.push(card);
  }
  const remoteLoose = remote.filter((item) => cardId(item) === undefined);
  const localLoose = local.filter(
    (item) =>
      cardId(item) === undefined &&
      !remoteLoose.some((kept) => isDeepStrictEqual(kept, item)),
  );
  return [...merged, ...remoteLoose, ...localLoose];
}

function cardIds(body: string): string[] {
  try {
    const doc = JSON.parse(body) as unknown;
    return Array.isArray(doc)
      ? doc.map(cardId).filter((id) => id !== undefined)
      : [];
  } catch {
    return [];
  }
}

export function removedCardIds(
  relativePath: string,
  remoteBody: string,
  mergedBody: string,
): string[] {
  const isBoard =
    relativePath === ACTIVITY_DOC || relativePath.endsWith(`/${ACTIVITY_DOC}`);
  if (!isBoard) return [];
  const kept = new Set(cardIds(mergedBody));
  return cardIds(remoteBody).filter((id) => !kept.has(id));
}
