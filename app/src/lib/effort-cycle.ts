import type { EffortLevel } from "./providers";

/**
 * The level a cycle-button click should select: the one after `current` in
 * `levels` (ordered low→high), wrapping past the last back to the first. When
 * `current` is unset or isn't a member of this model's set, cycling starts at
 * the first level. Returns `undefined` only when `levels` is empty (the model
 * has no effort control), so the caller can no-op.
 */
export function nextEffort(
  levels: readonly EffortLevel[],
  current: string | null | undefined,
): EffortLevel | undefined {
  if (levels.length === 0) return undefined;
  const index = current ? levels.indexOf(current as EffortLevel) : -1;
  return levels[(index + 1) % levels.length];
}
