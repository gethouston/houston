/**
 * The custom-integration OAuth return gate (PRODUCT-1298).
 *
 * A custom integration's browser sign-in has NO client-side poll: the outcome
 * lands on the host's callback and arrives as a `CustomIntegrationsChanged`
 * event. That same event also fires for causes with no browser involved — a
 * manual add, the in-chat credential card, and an AGENT adding an integration
 * mid-turn — and focusing the window on those would steal focus from whatever
 * the user is doing. So the snap-back is gated on "a browser OAuth was started
 * from THIS window recently": marked when the authorize URL is opened,
 * consumed (one-shot) by the first change event inside the window.
 *
 * The window bounds a stale marker: an abandoned sign-in must not surface the
 * app an hour later when an unrelated change event happens to arrive.
 */

/** How long a started OAuth may claim the next change event as its return. */
export const CUSTOM_OAUTH_RETURN_WINDOW_MS = 10 * 60 * 1000;

let startedAt: number | null = null;

/** Record that the authorize URL was just handed to the browser. */
export function markCustomOAuthStarted(now: number = Date.now()): void {
  startedAt = now;
}

/**
 * One-shot read: true when an OAuth was started within the window. Always
 * clears the marker — a stale start is retired, and a fresh one may claim
 * exactly one change event as its landing.
 */
export function consumeCustomOAuthReturn(now: number = Date.now()): boolean {
  const fresh =
    startedAt !== null && now - startedAt <= CUSTOM_OAUTH_RETURN_WINDOW_MS;
  startedAt = null;
  return fresh;
}
