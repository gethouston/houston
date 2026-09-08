/**
 * How an approval card shows the verbatim material its question is ABOUT — the
 * exact text a file would be written with, the exact arguments a destructive
 * operation would run with.
 *
 * It exists because of what an approval card MEANS: a value the user cannot see
 * is a value they did not approve. So four properties are non-negotiable, and
 * this is the single place that states them:
 * - the value is shown WHOLE and selectable, never clipped or elided;
 * - whitespace survives, because whitespace is part of what is being approved;
 * - it is monospaced, so the value reads exactly as it would be written;
 * - it scrolls inside a bounded height, so a long value cannot push the answer
 *   row off the card.
 *
 * Every visual value is a design token; a literal colour here would be a bug.
 */
export const INTERACTION_DETAIL_CLASS =
  "max-h-48 select-text overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line/50 bg-chip-subtle/50 px-3 py-2 font-mono text-ink text-xs leading-snug";
