import type { ReadCursor, ReadCursorStore } from "./read-cursors.ts";

/**
 * Decoder for the persisted read-cursor blob (HOU-945).
 *
 * Split out of `read-cursors.ts` because it answers a different question: that
 * module owns the cursor ALGEBRA (floors, watermarks, the growth cap) over a
 * store it can trust, while this one is the boundary that decides what may be
 * trusted at all. Everything crossing it is untyped text written by an older
 * build, another tab, or a user with devtools open.
 *
 * It is total: it never throws, and it never returns a partially-typed store.
 * A payload that is not an object, a `since` that is not a finite number, and a
 * row that is not a cursor are each replaced or dropped INDIVIDUALLY, so one
 * bad entry costs the user one conversation's read state rather than all of it.
 */

/**
 * The schema version stamped on every blob this build writes.
 *
 * It is deliberately NOT a gate. This decoder validates field by field, so a
 * blob from a build that predates the stamp (no `version` at all) and a blob
 * from a FUTURE build both decode to exactly the fields they share with us —
 * which is the whole point of the field-wise design, and the reason two Houston
 * versions open in two tabs cannot corrupt each other. The number exists so a
 * change that genuinely CANNOT be expressed field-wise has a marker to branch
 * on; until such a change exists, nothing reads it.
 */
export const READ_CURSOR_SCHEMA_VERSION = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

/** One stored entry, or null when it is not a cursor we can trust. */
function parseCursor(value: unknown): ReadCursor | null {
  if (!isRecord(value)) return null;
  const readAt = finiteNumber(value.readAt);
  if (readAt === undefined) return null;
  const notifiedAt = finiteNumber(value.notifiedAt);
  return notifiedAt === undefined ? { readAt } : { readAt, notifiedAt };
}

/** JSON.parse that answers `undefined` instead of throwing. */
function decode(raw: string | null): Record<string, unknown> | undefined {
  if (raw === null) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Decode a stored blob into a store, falling back to a fresh one floored at
 * `now`.
 *
 * The empty-on-corruption fallback is a DELIBERATE silent recovery, the
 * documented exception to the no-silent-failures rule: cursors are derived
 * convenience state that the app rewrites within seconds of use, there is
 * nothing here a user could act on, and letting a stray parse error escape
 * would take down the shell over a badge.
 */
export function parseReadCursorStore(
  raw: string | null,
  now: number,
): ReadCursorStore {
  const parsed = decode(raw);
  if (!parsed) return { since: now, cursors: {} };

  const cursors: Record<string, ReadCursor> = {};
  if (isRecord(parsed.cursors)) {
    for (const [key, value] of Object.entries(parsed.cursors)) {
      const cursor = parseCursor(value);
      if (cursor) cursors[key] = cursor;
    }
  }
  return { since: finiteNumber(parsed.since) ?? now, cursors };
}

/**
 * When the blob was last written, epoch ms — 0 for anything that cannot say.
 *
 * Read WITHOUT decoding the cursors, because its one caller sweeps the blobs of
 * OTHER accounts on this device to decide which to evict, and those are exactly
 * the blobs whose contents are none of the current user's business. A blob with
 * no stamp (written before this field existed) sorts oldest and is evicted
 * first, which costs that account its read floor and nothing else.
 */
export function parseLastTouched(raw: string | null): number {
  return finiteNumber(decode(raw)?.lastTouched) ?? 0;
}
