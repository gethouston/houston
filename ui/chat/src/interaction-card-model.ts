// Shared data types + stateless value helpers for ChatInteractionCard. DOM-free
// so the node:test suite can import them; the stepper state machine in
// interaction-card-logic.ts builds on these, and the .tsx component re-uses them.

export interface ChatInteractionOption {
  id: string;
  label: string;
  /** TOLERATED on the wire but NOT rendered: the card shows label + Recommended
   *  chip only. Kept optional so existing steps carrying it still parse; the
   *  ask_user tool no longer asks the model to produce it. */
  description?: string;
  /** Marks this as the suggested default (at most one per question), shown as a
   *  soft "Recommended" chip beside the label. Optional and additive. */
  recommended?: boolean;
}

export type ChatInteractionStep =
  | {
      kind: "question";
      id: string;
      question: string;
      options?: ChatInteractionOption[];
    }
  | { kind: "signin"; id: string; reason?: string }
  | { kind: "connect"; id: string; toolkit: string; reason?: string }
  | {
      kind: "approval";
      id: string;
      /** Lowercase toolkit slug, e.g. "gmail". */
      toolkit: string;
      /** The action slug, e.g. "GMAIL_SEND_DRAFT". */
      action: string;
      /** Display-ready key/values rendered as the card's param rows. */
      params?: Record<string, string>;
      /** How many params were dropped past the card's row cap (present only when
       *  > 0); the card shows a "+N more" line so the user knows the approval
       *  covers settings the rows don't show. */
      paramsOmitted?: number;
      /** Stable digest of (action, params); the one-shot allow ticket's key. */
      paramsHash: string;
    }
  // HOU-550: enter a custom integration's API key in a secure field (the secret
  // never lands in the transcript). `toolkit` is the custom integration's slug.
  | { kind: "credential"; id: string; toolkit: string; reason?: string };

/** One completed question answer handed to `onComplete`, in step order. */
export interface ChatInteractionAnswer {
  stepId: string;
  question: string;
  answer: string;
}

/** True when the agent offered concrete choices (option rows render). */
export function hasSelectableOptions(
  options?: ChatInteractionOption[],
): boolean {
  return Array.isArray(options) && options.length > 0;
}

/** Trim a typed free-text answer; whitespace-only answers are not sendable. */
export function normalizeAnswer(text: string): string | null {
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** A readable app name from a toolkit slug, for the connect step's fallback
 *  title when the agent gave no reason ("google-sheets" -> "Google Sheets").
 *  A best-effort human label from the slug alone — the app's catalog name (when
 *  it resolves) still drives the row below; this only fills the header slot. */
export function prettifyToolkit(toolkit: string): string {
  return toolkit
    .trim()
    .split(/[\s_-]+/)
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** A readable action name from a Composio action slug, for the approval step's
 *  title ("GMAIL_SEND_DRAFT" + toolkit "gmail" -> "send draft"). Strips the
 *  toolkit prefix (case-insensitive, matching the `GMAIL_SEND_DRAFT` / `gmail`
 *  convention, incl. multi-word toolkits like `google_maps`), then lowercases
 *  the `_`-joined remainder into words. Falls back to humanizing the whole slug
 *  when it does not carry the toolkit prefix or the prefix is all there is. */
export function humanizeActionSlug(action: string, toolkit: string): string {
  const words = (slug: string): string =>
    slug
      .split("_")
      .filter((w) => w.length > 0)
      .map((w) => w.toLowerCase())
      .join(" ");
  const prefix = `${toolkit.toLowerCase()}_`;
  if (toolkit.length > 0 && action.toLowerCase().startsWith(prefix)) {
    const remainder = words(action.slice(prefix.length));
    if (remainder.length > 0) return remainder;
  }
  return words(action);
}

/** The option label for a question step, or null when the id is unknown. */
export function optionLabel(
  step: ChatInteractionStep,
  optionId: string,
): string | null {
  if (step.kind !== "question") return null;
  return step.options?.find((o) => o.id === optionId)?.label ?? null;
}
