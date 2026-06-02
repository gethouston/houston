/**
 * Pure presentation logic for the inline Composio connection card
 * (`ComposioLinkCard`). Extracted so the three-way visual state and the
 * "should we nudge the agent" decision are unit-testable without a DOM —
 * the component stays a thin shell over these functions.
 *
 * Background (issue #379): the old card folded *status* and *action* into
 * one button that read "I've connected" while also showing reconnect
 * arrows, so it looked like it was simultaneously claiming a connection and
 * offering to redo it. The new model keeps them separate: a status badge
 * (connecting / connected) plus a distinct arrows button to (re)open the
 * auth flow.
 */

/**
 * Local interaction state owned by the card. The real connection status
 * (`isConnected`, resolved from the shared probe query) is tracked
 * separately and always wins over this phase.
 *
 *   - "idle"       — the user has not started a connect from this card.
 *   - "connecting" — the user clicked Connect / Reconnect and we are
 *                    waiting for the connection to land. Detection is
 *                    automatic via the connection watchers, so there is no
 *                    manual "I've connected" step anymore.
 */
export type ComposioCardPhase = "idle" | "connecting";

/**
 * What the card actually renders, derived from the real connection status
 * and the local phase.
 *
 *   - "connected"  — green "Connected" badge + arrows reconnect button.
 *   - "connecting" — "Connecting…" loading badge + arrows reconnect button.
 *   - "idle"       — single "Connect" call-to-action button.
 */
export type ComposioCardView = "idle" | "connecting" | "connected";

/**
 * Map (real status, local phase) → the rendered view. A confirmed
 * connection always wins: once the probe says connected we show the
 * connected badge regardless of where the local phase sits, so a stale
 * "connecting" can never mask a live connection.
 */
export function deriveComposioCardView(
  isConnected: boolean,
  phase: ComposioCardPhase,
): ComposioCardView {
  if (isConnected) return "connected";
  if (phase === "connecting") return "connecting";
  return "idle";
}

export interface ConnectedFollowupInput {
  /** The card's previous `isConnected` snapshot. */
  wasConnected: boolean;
  /** The card's current `isConnected` value. */
  isConnected: boolean;
  /** Did the user start a connect / reconnect from THIS card? */
  hasInitiated: boolean;
  /** Have we already sent the follow-up for this connection? */
  alreadyFired: boolean;
}

/**
 * Decide whether to send the proactive "I've connected X, please continue"
 * follow-up to the agent.
 *
 * Fires exactly once, only on a real not-connected → connected transition,
 * and only when the user drove the connect from this card. That is what
 * keeps the nudge honest:
 *
 *   - A card that mounts already-connected (the agent linked an app the
 *     user had connected earlier) never nudges — there was no transition
 *     and no user action here.
 *   - A connection that lands because another card, the Integrations tab,
 *     or the CLI did the work never nudges from this card (`hasInitiated`
 *     is false), so two cards for two apps each only speak for their own.
 *   - `alreadyFired` dedupes against re-renders and status flaps.
 */
export function shouldSendConnectedFollowup({
  wasConnected,
  isConnected,
  hasInitiated,
  alreadyFired,
}: ConnectedFollowupInput): boolean {
  return isConnected && !wasConnected && hasInitiated && !alreadyFired;
}

/**
 * Parse a Composio redirect URL for the `#houston_toolkit=<slug>` fragment
 * that agents append per the system prompt. Returns the slug, or `null` if
 * the URL doesn't carry one — which is the chat link renderer's signal to
 * fall back to a plain markdown link instead of rendering the card.
 */
export function parseComposioToolkitFromHref(href: string): string | null {
  try {
    const url = new URL(href);
    const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
    if (!hash) return null;
    const params = new URLSearchParams(hash);
    const slug = params.get("houston_toolkit");
    return slug && slug.length > 0 ? slug : null;
  } catch {
    return null;
  }
}

/**
 * Best-effort logo when Composio's catalog doesn't supply one: Google's
 * favicon service, keyed off the toolkit slug as a domain guess.
 */
export function fallbackLogo(toolkit: string): string {
  return `https://www.google.com/s2/favicons?domain=${toolkit}.com&sz=128`;
}
