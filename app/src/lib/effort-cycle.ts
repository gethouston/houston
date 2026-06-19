import type { EffortLevel } from "./providers";

/**
 * Level selected by a cycle-button click. Advances within `levels`, wrapping
 * past the last item, and starts at the first level when `current` is unset or
 * unsupported by the active model.
 */
export function nextEffort(
  levels: readonly EffortLevel[],
  current: string | null | undefined,
): EffortLevel | undefined {
  if (levels.length === 0) return undefined;
  const index = current ? levels.indexOf(current as EffortLevel) : -1;
  return levels[(index + 1) % levels.length];
}
