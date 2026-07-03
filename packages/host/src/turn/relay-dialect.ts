import {
  type ConversationSnapshot,
  EMPTY_SNAPSHOT,
} from "@houston/runtime-client";

/**
 * The relay's bus dialect: versioned channel/key names and the defensive
 * decoder for what other replicas persisted.
 *
 * The names are DIALECT-VERSIONED (`turn:ev2:` / `turn:snap2:`): the payload
 * shapes changed when sequencing moved into the envelope (v1 wrapped events
 * as `{turnId,seq,event}` / `{turnId,seq,snapshot}`), and a mixed fleet
 * during a rolling deploy must not cross-feed dialects — old replicas keep
 * speaking v1 among themselves on the old names, new replicas speak v2, and
 * stale v1 keys age out with their TTL. Bump the suffix whenever the payload
 * shape changes again.
 */

/** How long the persisted snapshot (and its seq watermark) outlives a turn. A
 *  cursor older than this resyncs anyway, so forgetting it is harmless. */
export const SNAP_TTL_SEC = 3_600;

export const eventChannel = (key: string) => `turn:ev2:${key}`;
export const snapKey = (key: string) => `turn:snap2:${key}`;

/** The message on the terminal frame synthesized for a turn whose pump died. */
export const TURN_DIED_MESSAGE = "The turn ended unexpectedly";

/**
 * Validate a persisted snapshot; anything not shaped like one — a foreign
 * dialect, a corrupt key — reads as EMPTY, which the routes surface as a
 * resync (never a crash or a poisoned cast).
 */
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
    };
  }
  return EMPTY_SNAPSHOT;
}
