/**
 * Arrow-key movement across the WRAPPING chips of one question — every run of
 * it at once, since a question is one radio group whatever it is drawn in.
 *
 * A wrapping run has no columns in the markup — the rows only exist once the
 * browser has laid it out. So the caller measures where each chip landed and
 * hands the rows in; everything here is pure, which is what makes "down keeps
 * your column, and clamps into a shorter row" testable at all.
 */

/** The keys this model answers to. Enter and Space stay with the button. */
const CHIP_GRID_KEYS = [
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
] as const;

export type ChipGridKey = (typeof CHIP_GRID_KEYS)[number];

export function isChipGridKey(key: string): key is ChipGridKey {
  return (CHIP_GRID_KEYS as readonly string[]).includes(key);
}

/**
 * Chip indices grouped into the rows the wrap produced, from each chip's
 * measured top edge in document order. Chips share one height, so a new top is
 * a new row; section headings between runs only ever start another row, which
 * is exactly how they read.
 */
export function groupIntoRows(tops: readonly number[]): number[][] {
  const rows: number[][] = [];
  let currentTop: number | null = null;
  for (const [index, top] of tops.entries()) {
    if (currentTop === null || top !== currentTop) {
      rows.push([index]);
      currentTop = top;
    } else {
      rows[rows.length - 1].push(index);
    }
  }
  return rows;
}

function locate(
  index: number,
  rows: readonly (readonly number[])[],
): { row: number; column: number } | null {
  for (const [row, indices] of rows.entries()) {
    const column = indices.indexOf(index);
    if (column !== -1) return { row, column };
  }
  return null;
}

/**
 * Where the focus goes, or null when the key asks for somewhere that isn't
 * there (the caller then leaves the event alone, so the dialog keeps its own
 * meaning for it). Left/right walk the question in reading order across rows
 * and runs alike; up/down hold the column and clamp into a shorter row;
 * Home/End are the first and last answer of the whole question, because the
 * question is one radio group and a row is only where the wrap fell.
 */
export function nextChipIndex(
  key: ChipGridKey,
  index: number,
  rows: readonly (readonly number[])[],
): number | null {
  const at = locate(index, rows);
  if (!at) return null;

  if (key === "ArrowLeft") return index > 0 ? index - 1 : null;
  if (key === "ArrowRight") {
    const last = rows.at(-1)?.at(-1) ?? index;
    return index < last ? index + 1 : null;
  }
  if (key === "Home") {
    const first = rows[0].at(0) ?? index;
    return first === index ? null : first;
  }
  if (key === "End") {
    const last = rows[rows.length - 1].at(-1) ?? index;
    return last === index ? null : last;
  }

  const target = rows[at.row + (key === "ArrowDown" ? 1 : -1)];
  if (!target) return null;
  return target[Math.min(at.column, target.length - 1)];
}
