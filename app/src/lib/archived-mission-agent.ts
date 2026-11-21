export function latchMissionAgent<T>(
  previous: T | null,
  selectedId: string | null,
  current: T | null,
): T | null {
  if (selectedId === null) return null;
  return current ?? previous;
}
