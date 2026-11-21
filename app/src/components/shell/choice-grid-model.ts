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
