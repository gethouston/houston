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

/**
 * What to do with a WINDOWED server fold arriving over the current VM feed.
 *
 * - `replace`: the fold is strictly newer (or richer at the same last
 *   message) than what is on screen — reseed the feed from it.
 * - `stamp`: the fold matches the feed exactly (same last-message time, same
 *   length) — keep the feed (reseeding would churn every entry id and force a
 *   full remount) but record the server window so load-older knows where the
 *   loaded feed starts.
 * - `skip`: the fold is poorer/older than the feed (a raced read resolving
 *   after a settle, or a tail shorter than a locally cached paint) — keep
 *   everything as is.
 *
 * Missing timestamps (pre-`ts` transcripts, legacy cache entries) fall back
 * to the historical richer-wins length guard.
 */
export function decideServerSeed(
  current: readonly { ts?: number }[],
  incoming: readonly { ts?: number }[],
): "replace" | "stamp" | "skip" {
  if (current.length === 0) return incoming.length > 0 ? "replace" : "skip";
  if (incoming.length === 0) return "skip";
  const curLast = current[current.length - 1]?.ts;
  const inLast = incoming[incoming.length - 1]?.ts;
  if (curLast === undefined || inLast === undefined) {
    return incoming.length > current.length ? "replace" : "skip";
  }
  if (inLast > curLast) return "replace";
  if (inLast < curLast) return "skip";
  if (incoming.length > current.length) return "replace";
  return incoming.length === current.length ? "stamp" : "skip";
}
