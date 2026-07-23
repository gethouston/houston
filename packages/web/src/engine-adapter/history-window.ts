/**
 * Chat transcript windowing (HOU-819).
 *
 * Opening a chat used to fetch and fold the ENTIRE conversation transcript —
 * on long missions that meant a multi-hundred-message JSON payload (held for
 * the whole pod cold start on cloud), a full markdown parse/render of every
 * bubble, and the same full fetch re-fired by every `ConversationsChanged`
 * invalidation while a turn ran. The chat "hung" before opening or accepting
 * input. Now a chat opens on the LAST {@link CHAT_OPEN_WINDOW} messages and
 * lazily prepends {@link CHAT_OLDER_PAGE}-message pages as the user scrolls
 * up (the VM's `historyWindow` tracks where the loaded feed starts).
 */

/** Messages fetched when a chat opens — the tail window. */
export const CHAT_OPEN_WINDOW = 120;

/** Messages fetched per scroll-up load-older page. */
export const CHAT_OLDER_PAGE = 80;

/** The minimal frame shape the seed decision reads. */
export interface SeedFrame {
  feed_type: string;
  data: unknown;
  pending?: boolean;
}

/**
 * What to do with a WINDOWED server fold arriving over the current VM feed.
 *
 * - `replace`: the fold is newer or richer — reseed the feed from it.
 * - `stamp`: the fold matches the feed exactly — keep the feed (reseeding
 *   would churn every entry id and force a full remount) but record the
 *   server window so load-older knows where the loaded feed starts.
 * - `skip`: the feed holds something the fold lacks (an unconfirmed
 *   optimistic send, a raced read resolving after a settle, or pages already
 *   loaded below the fold's window) — keep everything as is.
 *
 * The comparison anchors on USER-MESSAGE CONTENT (the turn skeleton), never
 * on frame timestamps: live pushes are stamped with the CLIENT clock while
 * history folds carry the runtime's `ChatMessage.ts` — two different clock
 * domains that cannot be ordered against each other (a cache written at
 * settle time would routinely compare "newer" than the authoritative tail).
 *
 * `currentHasWindow` = the feed already carries a stamped `historyWindow`
 * (a prior windowed seed / loaded pages): a same-content, shorter fold then
 * skips instead of discarding the loaded pages, while an UNSTAMPED longer
 * paint (a cache) is replaced so the on-screen feed maps to real server
 * indices before load-older arms.
 */
export function decideServerSeed(
  current: readonly SeedFrame[],
  incoming: readonly SeedFrame[],
  currentHasWindow: boolean,
): "replace" | "stamp" | "skip" {
  if (current.length === 0) return incoming.length > 0 ? "replace" : "skip";
  if (incoming.length === 0) return "skip";
  // Never clobber an optimistic bubble the engine has not confirmed — the
  // fold cannot contain it yet by definition.
  if (current.some((f) => f.pending === true)) return "skip";

  const curU = lastUserIndex(current);
  const incU = lastUserIndex(incoming);
  if (curU === -1 || incU === -1) {
    // No turn anchor on one side (a window sliced mid-turn, odd folds):
    // fall back to richer-wins.
    if (incoming.length > current.length) return "replace";
    if (incoming.length === current.length) return "stamp";
    return currentHasWindow ? "skip" : "replace";
  }

  const curLastUser = frameText(current[curU]);
  const incLastUser = frameText(incoming[incU]);
  if (curLastUser !== incLastUser) {
    // Different latest turns: the side CONTAINING the other's latest turn is
    // the newer superset.
    if (containsUser(incoming, curLastUser)) return "replace";
    if (containsUser(current, incLastUser)) return "skip";
    // Disjoint (the tail window starts beyond everything on screen): the
    // server is authoritative for a feed no stream owns.
    return "replace";
  }

  // Same latest turn on both sides: compare what followed it.
  const curAfter = current.length - 1 - curU;
  const incAfter = incoming.length - 1 - incU;
  if (incAfter > curAfter) return "replace"; // fold has settled content the feed lacks
  if (incAfter < curAfter) return "skip"; // feed has settled content the fold missed
  // Identical latest turn; only the OLDER region can differ.
  if (incoming.length === current.length) return "stamp";
  if (incoming.length > current.length) return "replace";
  return currentHasWindow ? "skip" : "replace";
}

function lastUserIndex(frames: readonly SeedFrame[]): number {
  for (let i = frames.length - 1; i >= 0; i--) {
    if (frames[i]?.feed_type === "user_message") return i;
  }
  return -1;
}

/** A frame's comparable text — user bubbles carry plain strings both live and folded. */
function frameText(frame: SeedFrame | undefined): string {
  const data = frame?.data;
  return typeof data === "string" ? data : JSON.stringify(data ?? null);
}

function containsUser(frames: readonly SeedFrame[], text: string): boolean {
  return frames.some(
    (f) => f.feed_type === "user_message" && frameText(f) === text,
  );
}

/**
 * Frame budget for the local conversation cache — sized to comfortably cover
 * an open window's fold (one MESSAGE folds to several frames).
 */
export const CACHE_FRAME_BUDGET = 360;

/** Absolute cache ceiling when a single turn overflows the budget. */
export const CACHE_FRAME_HARD_MAX = 600;

/**
 * Trim a feed snapshot for the cache WITHOUT cutting a turn apart: past the
 * budget, the cut walks back to the previous `user_message` boundary so a
 * cold-open paint never starts mid-turn (a tool-heavy reply alone can exceed
 * a naive frame cap, which would paint a transcript missing its own prompt).
 * A single turn larger than {@link CACHE_FRAME_HARD_MAX} is cut mid-turn —
 * the ceiling wins.
 */
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
