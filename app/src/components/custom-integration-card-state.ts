import type { InteractionStep } from "@houston/protocol";

/**
 * Pure logic for the inline custom-integration setup card
 * (`CustomIntegrationCard`) — the secure card the chat renders in place of the
 * composer when the agent proposes a service the app catalog can't offer
 * (`propose_custom_integration` → a `custom_integration` interaction step).
 * Extracted so hostname parsing, the API-key gate, and the three-way visual
 * state are unit-testable without a DOM; the component stays a thin shell over
 * these functions.
 *
 * The API key NEVER flows through this module: it lives only in the card's
 * local input state and the single create call. Nothing here reads, stores,
 * derives from, or logs it.
 */

/** The agent-authored proposal, straight off the interaction step. */
export type CustomProposal = Extract<
  InteractionStep,
  { kind: "custom_integration" }
>["proposal"];

/**
 * The display hostname for a proposed base URL — the "who am I trusting" line
 * the user reads. The base URL is agent-authored, so a malformed value must
 * degrade to the raw trimmed string rather than throw or blank the card.
 */
export function hostnameFromBaseUrl(baseUrl: string): string {
  try {
    const host = new URL(baseUrl).hostname;
    return host || baseUrl.trim();
  } catch {
    return baseUrl.trim();
  }
}

/**
 * A favicon URL for the proposed service, resolved from its hostname (the same
 * Google favicon service the app-card fallback uses). `null` when the base URL
 * has no parseable host, so the card falls back to an initial-letter glyph.
 */
export function customFaviconUrl(baseUrl: string): string | null {
  let host: string;
  try {
    host = new URL(baseUrl).hostname;
  } catch {
    return null;
  }
  if (!host) return null;
  return `https://www.google.com/s2/favicons?domain=${host}&sz=128`;
}

/** The gateway's API-key length bound; the gateway stays the real authority. */
const MAX_KEY = 4096;

/**
 * Is the typed API key submittable? Mirrors the gateway's `1..4096` bound so an
 * empty or oversized submit never round-trips; the card disables Add until this
 * holds. Whitespace-only counts as empty — a real key never is.
 */
export function canSubmitKey(key: string): boolean {
  return key.trim().length >= 1 && key.length <= MAX_KEY;
}

/**
 * What the card renders:
 *   - "done"       — the integration was created + granted (transient, right
 *                    before the card unmounts) — always wins over a stale local
 *                    submit flag.
 *   - "submitting" — the create + grant call the user started is in flight.
 *   - "idle"       — the key field + Add / Not now actions.
 */
export type CustomCardView = "idle" | "submitting" | "done";

export function deriveCustomCardView(
  isSubmitting: boolean,
  isDone: boolean,
): CustomCardView {
  if (isDone) return "done";
  if (isSubmitting) return "submitting";
  return "idle";
}

// Custom-integration proposals render as steps in the unified ChatInteractionCard
// (see useAgentChatPanel's composerOverride), gated on
// `customIntegrationsSupported(capabilities)` so the card stays off hosts with no
// `custom` provider to create against. No standalone resolver is needed.
