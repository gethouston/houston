/**
 * Tracks which conversation session keys have had their persisted chat
 * history loaded into the board's feed, so each session is hydrated at most
 * once — without ever stranding a session whose first load came back empty.
 *
 * The naive approach (mark the key the moment a load *starts* and never look
 * again) has a sharp edge for routine-surfaced activities. Their chat is
 * populated ONLY by this history load: they carry no optimistic user message,
 * and after an app reload there is no live feed to fall back on. If that first
 * load resolves empty — e.g. it is requested a beat before the transcript is
 * queryable — the key stays cached forever and the conversation renders blank
 * until the board remounts. That is the "open the second routine issue and its
 * messages never show" bug: the user has to click a different (non-routine)
 * issue to force a remount before the content appears.
 *
 * This cache fixes it by only remembering a key once its load actually yielded
 * content. An empty or failed load is left retryable, so the next time the
 * session is selected it loads again. An in-flight guard keeps a single
 * request per key so re-renders don't fan out duplicate fetches.
 *
 * It deliberately does NOT gate on "is the feed currently empty". Doing so
 * would resurrect an older bug where a live item that arrived before hydration
 * (e.g. a phone pushed a message into a session the user hadn't opened yet)
 * suppressed the history load entirely.
 */
export class SessionHydrationCache {
  private readonly loaded = new Set<string>()
  private readonly inFlight = new Set<string>()

  /**
   * Whether a fresh history load should start for `sessionKey`. False when we
   * have already loaded content for it, or a load is already in flight.
   */
  shouldLoad(sessionKey: string): boolean {
    return !this.loaded.has(sessionKey) && !this.inFlight.has(sessionKey)
  }

  /** Record that a load for `sessionKey` has started (dedupes concurrent loads). */
  begin(sessionKey: string): void {
    this.inFlight.add(sessionKey)
  }

  /**
   * Record a load's outcome. `hadContent: true` caches the key so it is never
   * reloaded; `false` (an empty result or a rejection) leaves it retryable on
   * the next selection.
   */
  settle(sessionKey: string, hadContent: boolean): void {
    this.inFlight.delete(sessionKey)
    if (hadContent) this.loaded.add(sessionKey)
  }
}
