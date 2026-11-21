import {
  type ConversationSnapshot,
  EMPTY_SNAPSHOT,
} from "@houston/runtime-client";

export const SNAP_TTL_SEC = 3_600;

export const eventChannel = (key: string) => `turn:ev2:${key}`;
export const snapKey = (key: string) => `turn:snap2:${key}`;

export const TURN_DIED_MESSAGE = "The turn ended unexpectedly";

export function parseSnapshot(raw: string | null): ConversationSnapshot {
  if (!raw) return EMPTY_SNAPSHOT;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return EMPTY_SNAPSHOT;
  }
  const s = v as Partial<ConversationSnapshot> | null;
  if (
    s !== null &&
    typeof s === "object" &&
    typeof s.running === "boolean" &&
    typeof s.partial === "string" &&
    typeof s.seq === "number" &&
    Number.isSafeInteger(s.seq) &&
    s.seq >= 0 &&
    (s.turnId === undefined || typeof s.turnId === "string")
  ) {
    return {
      running: s.running,
      partial: s.partial,
      seq: s.seq,
      ...(s.turnId ? { turnId: s.turnId } : {}),
      ...(typeof s.thinking === "string" ? { thinking: s.thinking } : {}),
      ...(Array.isArray(s.tools)
        ? {
            tools: s.tools.filter(
              (t): t is NonNullable<ConversationSnapshot["tools"]>[number] =>
                t !== null &&
                typeof t === "object" &&
                typeof (t as { name?: unknown }).name === "string",
            ),
          }
        : {}),
    };
  }
  return EMPTY_SNAPSHOT;
}
