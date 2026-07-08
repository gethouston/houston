import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";

/**
 * Pure logic for the inline integration connect card (`IntegrationConnectCard`)
 * — the rich card the chat renders in place of a markdown link the agent tags
 * with `#houston_toolkit=<slug>` when a needed app isn't connected (HOU-670).
 * Extracted so the parsing and the three-way visual state are unit-testable
 * without a DOM; the component stays a thin shell over these functions.
 */

/**
 * Parse an agent-authored link for the `#houston_toolkit=<slug>` fragment
 * (per the system prompt). Returns the slug, or `null` when the URL doesn't
 * carry one — the chat link renderer's signal to fall back to a plain
 * markdown link. Accepts ANY base URL so cards survive across prompt
 * revisions (the legacy Rust engine embedded real Composio OAuth URLs; the
 * TS engine uses a stable placeholder — both carry the same fragment).
 */
export function parseToolkitFromHref(href: string): string | null {
  try {
    const url = new URL(href);
    const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
    if (!hash) return null;
    const slug = new URLSearchParams(hash).get("houston_toolkit");
    return slug && slug.length > 0 ? slug : null;
  } catch {
    return null;
  }
}

/**
 * Canonical slug form for comparisons: the provider catalog and connection
 * lists report lowercased slugs, while the fragment is agent-authored and can
 * carry any casing or stray whitespace. Comparing raw values silently misses
 * a real connection and leaves the card stuck on "Connect" forever.
 */
export function normalizeToolkitSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

/** Does the user hold an ACTIVE connection to this toolkit? */
export function isToolkitConnected(
  connections: IntegrationConnection[] | undefined,
  toolkit: string,
): boolean {
  const slug = normalizeToolkitSlug(toolkit);
  return (connections ?? []).some(
    (c) => c.status === "active" && normalizeToolkitSlug(c.toolkit) === slug,
  );
}

/** The catalog entry for an agent-authored slug (casing-insensitive). */
export function findCatalogToolkit(
  catalog: IntegrationToolkit[] | undefined,
  toolkit: string,
): IntegrationToolkit | undefined {
  const slug = normalizeToolkitSlug(toolkit);
  return (catalog ?? []).find((t) => normalizeToolkitSlug(t.slug) === slug);
}

/**
 * What the card renders:
 *   - "connected"  — green "Connected" badge (the real status always wins).
 *   - "connecting" — loading badge while the OAuth the user started from this
 *                    card is being polled.
 *   - "idle"       — the "Connect" call-to-action.
 */
export type ConnectCardView = "idle" | "connecting" | "connected";

export function deriveConnectCardView(
  isConnected: boolean,
  isConnecting: boolean,
): ConnectCardView {
  if (isConnected) return "connected";
  if (isConnecting) return "connecting";
  return "idle";
}

/**
 * Stepper mode only (a `request_connection` step inside the interaction
 * sequence): should the card fire `onConnected` WITHOUT a user click?
 *
 * A connect step for a toolkit the user already holds renders a "Connected"
 * badge with NO Connect button, so the only path that advances the sequence
 * (`onConnected`) can never run from a click. Without this the whole interaction
 * soft-locks: the queued question answers are never sent, and Back onto an
 * already-completed connect step in a multi-connect run wedges the same way.
 * So when the card is in stepper mode and the connection is already active, it
 * self-reports once — gated on the catalog having settled so the emitted app
 * name is the real display name, not the raw slug, and on the one-shot nudge
 * not having already fired (a user-driven connect from the same card).
 *
 * The inline `#houston_toolkit` markdown-link card leaves `autoContinue` off and
 * stays a passive badge — it has no sequence to advance and must not nudge the
 * agent about a connection the user never touched.
 */
export function shouldAutoContinueConnected(args: {
  autoContinue: boolean;
  isConnected: boolean;
  catalogSettled: boolean;
  alreadyFired: boolean;
}): boolean {
  return (
    args.autoContinue &&
    args.isConnected &&
    args.catalogSettled &&
    !args.alreadyFired
  );
}
