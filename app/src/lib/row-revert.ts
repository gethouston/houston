export interface RowRevert<R> {
  keyOf: (row: R) => string;
  touched: (row: R) => boolean;
  added?: (row: R) => boolean;
  restore?: (current: R, before: R) => R;
  reinsert?: boolean;
}

function anchorIndex<R>(
  next: R[],
  before: R[],
  from: number,
  keyOf: (row: R) => string,
): number {
  const find = (i: number) => {
    const key = keyOf(before[i] as R);
    return next.findIndex((row) => keyOf(row) === key);
  };
  for (let i = from - 1; i >= 0; i--) {
    const at = find(i);
    if (at !== -1) return at + 1;
  }
  for (let i = from + 1; i < before.length; i++) {
    const at = find(i);
    if (at !== -1) return at;
  }
  return next.length;
}

export function revertRows<R>(
  current: R[] | undefined,
  before: R[] | undefined,
  spec: RowRevert<R>,
): R[] | undefined {
  if (!current || !before) return current;
  const { keyOf } = spec;
  const beforeKeys = new Set(before.map(keyOf));
  const originals = new Map(
    before.filter(spec.touched).map((row) => [keyOf(row), row]),
  );
  let changed = false;
  const next: R[] = [];
  for (const row of current) {
    const key = keyOf(row);
    const original = originals.get(key);
    if (original) {
      const restored = spec.restore ? spec.restore(row, original) : original;
      changed ||= restored !== row;
      next.push(restored);
    } else if (spec.added?.(row) && !beforeKeys.has(key)) {
      changed = true;
    } else {
      next.push(row);
    }
  }
  if (spec.reinsert === false) return changed ? next : current;
  const listed = new Set(next.map(keyOf));
  before.forEach((row, i) => {
    const key = keyOf(row);
    if (!originals.has(key) || listed.has(key)) return;
    next.splice(anchorIndex(next, before, i, keyOf), 0, row);
    listed.add(key);
    changed = true;
  });
  return changed ? next : current;
}

export function restoreFields<R extends object>(
  current: R,
  before: R,
  keys: readonly string[],
): R {
  const next = { ...current };
  for (const key of keys) {
    if (key in before) Reflect.set(next, key, Reflect.get(before, key));
    else Reflect.deleteProperty(next, key);
  }
  return next;
}
