export const CHAT_OPEN_WINDOW = 120;

export const CHAT_OLDER_PAGE = 80;

export const SEARCH_SCAN_WINDOW = 400;

export interface SeedFrame {
  feed_type: string;
  data: unknown;
  pending?: boolean;
}

export function decideServerSeed(
  current: readonly SeedFrame[],
  incoming: readonly SeedFrame[],
  currentHasWindow: boolean,
): "replace" | "stamp" | "skip" {
  if (current.length === 0) return incoming.length > 0 ? "replace" : "skip";
  if (incoming.length === 0) return "skip";
  if (current.some((f) => f.pending === true)) return "skip";

  const curU = lastUserIndex(current);
  const incU = lastUserIndex(incoming);
  if (curU === -1 || incU === -1) {
    if (incoming.length > current.length) return "replace";
    if (incoming.length === current.length)
      return sameContent(current, incoming) ? "stamp" : "replace";
    return currentHasWindow ? "skip" : "replace";
  }

  const curLastUser = frameText(current[curU]);
  const incLastUser = frameText(incoming[incU]);
  if (curLastUser !== incLastUser) {
    if (containsUser(incoming, curLastUser)) return "replace";
    if (containsUser(current, incLastUser)) return "skip";
    return "replace";
  }

  const curAfter = current.length - 1 - curU;
  const incAfter = incoming.length - 1 - incU;
  if (incAfter > curAfter) return "replace";
  if (incAfter < curAfter) return "skip";
  if (incoming.length === current.length)
    return sameContent(current, incoming) ? "stamp" : "replace";
  if (incoming.length > current.length) return "replace";
  return currentHasWindow ? "skip" : "replace";
}

function sameContent(
  current: readonly SeedFrame[],
  incoming: readonly SeedFrame[],
): boolean {
  return current.every(
    (frame, index) =>
      frame.feed_type === incoming[index]?.feed_type &&
      JSON.stringify(frame.data) === JSON.stringify(incoming[index]?.data),
  );
}

function lastUserIndex(frames: readonly SeedFrame[]): number {
  for (let i = frames.length - 1; i >= 0; i--) {
    if (frames[i]?.feed_type === "user_message") return i;
  }
  return -1;
}

function frameText(frame: SeedFrame | undefined): string {
  const data = frame?.data;
  return typeof data === "string" ? data : JSON.stringify(data ?? null);
}

function containsUser(frames: readonly SeedFrame[], text: string): boolean {
  return frames.some(
    (f) => f.feed_type === "user_message" && frameText(f) === text,
  );
}

export const CACHE_FRAME_BUDGET = 360;

export const CACHE_FRAME_HARD_MAX = 600;

export function trimForCache<T extends { feed_type: string }>(
  frames: readonly T[],
  budget: number = CACHE_FRAME_BUDGET,
  hardMax: number = CACHE_FRAME_HARD_MAX,
): readonly T[] {
  if (frames.length <= budget) return frames;
  let start = frames.length - budget;
  while (
    start > 0 &&
    frames[start]?.feed_type !== "user_message" &&
    frames.length - start < hardMax
  ) {
    start--;
  }
  return frames.slice(start);
}
