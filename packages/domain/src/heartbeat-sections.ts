export const HEARTBEAT_SECTION_CAP = 20;

export interface HeartbeatSection<T> {
  items: T[];
  more: number;
}

export interface Keyed {
  key: string;
  at: string;
}

export interface OrderedSection<T> {
  section: HeartbeatSection<T>;
  unseen: number;
  named: string[];
  present: string[];
}

export type HeartbeatItemKind = "need" | "done" | "run" | "pause";

export const heartbeatItemKey = (
  kind: HeartbeatItemKind,
  agentId: string,
  rest: string,
) => `${kind}:${agentId}/${rest}`;

export const keyOfAgent = (key: string, agentId: string) =>
  key.slice(key.indexOf(":") + 1).startsWith(`${agentId}/`);

function instant(item: Keyed): number | null {
  const ms = Date.parse(item.at);
  return Number.isNaN(ms) ? null : ms;
}

function oldestFirst(a: Keyed, b: Keyed): number {
  const ta = instant(a) ?? Number.NEGATIVE_INFINITY;
  const tb = instant(b) ?? Number.NEGATIVE_INFINITY;
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

export function orderSection<T extends Keyed>(
  items: readonly T[],
  seen: ReadonlySet<string>,
): OrderedSection<T> {
  const unseen = items.filter((item) => !seen.has(item.key)).sort(oldestFirst);
  const told = items
    .filter((item) => seen.has(item.key))
    .sort((a, b) => oldestFirst(b, a));
  const ordered = [...unseen, ...told];
  const kept = ordered.slice(0, HEARTBEAT_SECTION_CAP);
  return {
    section: {
      items: kept,
      more: Math.max(0, ordered.length - HEARTBEAT_SECTION_CAP),
    },
    unseen: unseen.length,
    named: kept.map((item) => item.key),
    present: items.map((item) => item.key),
  };
}
