import type { ReadCursor, ReadCursorStore } from "./read-cursors.ts";

export const READ_CURSOR_SCHEMA_VERSION = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function parseCursor(value: unknown): ReadCursor | null {
  if (!isRecord(value)) return null;
  const readAt = finiteNumber(value.readAt);
  if (readAt === undefined) return null;
  const notifiedAt = finiteNumber(value.notifiedAt);
  return notifiedAt === undefined ? { readAt } : { readAt, notifiedAt };
}

function decode(raw: string | null): Record<string, unknown> | undefined {
  if (raw === null) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

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

export function parseLastTouched(raw: string | null): number {
  return finiteNumber(decode(raw)?.lastTouched) ?? 0;
}
