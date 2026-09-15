/**
 * A pending-interaction dismiss refused because a turn is running on that
 * chat (HOUSTON-APP-5EY / PRODUCT-1827).
 *
 * The runtime's `dismiss-interaction` route has exactly one 409 of its own:
 * `turn running`, answered when a turn is accepted, queued or executing on the
 * conversation. The card the X sits on is never rendered while THIS client
 * believes a turn runs, so reaching the 409 means the client's view was stale
 * when the click landed: the turn started from another device, a member's
 * send in a shared chat, a routine fire, or a webhook, and the live stream
 * had not caught this window up yet (a desktop coming back from the
 * background is the recorded case). The runtime is right and nothing broke:
 * the running turn already retired that interaction, exactly what the X asked
 * for. The honest surface is a resync plus "already working on it, Stop to
 * abandon", never a red bug toast, so `call()` silences it (still logged, no
 * Sentry report) and the panel resyncs instead of clearing a persisted card a
 * settling turn may be about to rewrite.
 *
 * Like `isFileGoneError`, the classifier keys on the structural `.status` both
 * engine adapters carry: the runtime answers a bare `{ error }` body with no
 * typed kind. Applied ONLY to the dismiss write; every other 409 stays loud.
 */
export function isTurnRunningError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  return (err as { status?: unknown }).status === 409;
}
