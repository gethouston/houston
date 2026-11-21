import type { EffortLevel } from "./providers";

export function nextEffort(
  levels: readonly EffortLevel[],
  current: string | null | undefined,
): EffortLevel | undefined {
  if (levels.length === 0) return undefined;
  const index = current ? levels.indexOf(current as EffortLevel) : -1;
  return levels[(index + 1) % levels.length];
}
