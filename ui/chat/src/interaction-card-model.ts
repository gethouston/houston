// Shared data types + stateless value helpers for ChatInteractionCard. DOM-free
// so the node:test suite can import them; the stepper state machine in
// interaction-card-logic.ts builds on these, and the .tsx component re-uses them.

/** A presentational app-identity lockup for a branded question card: the app's
 *  display NAME plus, when the catalog resolved it, a logo URL. Resolved by the
 *  app (ui/chat stays Composio-unaware) and rendered in the modal's title slot
 *  the way the connect card renders its identity. A missing `logoUrl` shows the
 *  name alone — never a broken image. */
export interface ChatInteractionBrand {
  name: string;
  logoUrl?: string;
}

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
      /** Hide the free-text escape row so the option rows are the ONLY way to
       *  answer. Meaningful only when `options` are present — a free-text-only
       *  question ignores it (the field IS the answer). */
      hideFreeText?: boolean;
      /** A presentational app-identity lockup: when the question concerns an
       *  integration, the app resolves the toolkit to this brand so the modal's
       *  title shows the app's logo + name (like the connect card) and the
       *  question text moves into the body. Absent = a plain question (text in
       *  the title). ui/chat never resolves it — the app does. */
      brand?: ChatInteractionBrand;
    }
  | { kind: "signin"; id: string; reason?: string }
  | { kind: "connect"; id: string; toolkit: string; reason?: string }
  // HOU-550: enter a custom integration's API key in a secure field (the secret
  // never lands in the transcript). `toolkit` is the custom integration's slug.
  | { kind: "credential"; id: string; toolkit: string; reason?: string }
  // A generic app-driven step: ui/chat owns none of its content. The renderer
  // (`renderCustom`) supplies the whole InteractionModal body — the card only
  // walks the stepper past it (contributing no answer). `title` is a short
  // fallback label; the renderer owns the modal's real title.
  | { kind: "custom"; id: string; title: string };

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

// Present-progressive forms for the common Composio action verbs. English only,
// by the same rule as `tool-labels.ts`: `ui/` stays i18n-agnostic and the app
// does not localize tool verbs, so an integration action reads in English in
// every locale (matching the in-pane tool rows). An unmapped verb is capitalized
// as-is, never conjugated — a wrong gerund reads worse than the plain word.
const ACTION_GERUNDS: Record<string, string> = {
  send: "Sending",
  create: "Creating",
  get: "Getting",
  fetch: "Fetching",
  list: "Listing",
  search: "Searching",
  find: "Finding",
  update: "Updating",
  delete: "Deleting",
  move: "Moving",
  reply: "Replying",
  post: "Posting",
  add: "Adding",
  remove: "Removing",
};

/** Capitalize the first letter, lowercase the rest ("SEND" -> "Send"). */
function capitalizeWord(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/** A present-tense human label for a Composio action slug, for the process-block
 *  header's branded row ("GMAIL_SEND_EMAIL" + toolkit "gmail" -> "Sending
 *  email"). Strips the toolkit prefix (case-insensitive, incl. multi-word
 *  toolkits like `google_maps`), turns the leading verb into its gerund, and
 *  lowercases the rest. An unmapped verb (or a slug that is all prefix) falls
 *  back to the capitalized de-underscored remainder without conjugation
 *  ("GMAIL_SYNC_CONTACTS" -> "Sync contacts"). Pure, node-tested. */
export function humanizeActionGerund(action: string, toolkit: string): string {
  const prefix = `${toolkit.toLowerCase()}_`;
  const rest =
    toolkit.length > 0 && action.toLowerCase().startsWith(prefix)
      ? action.slice(prefix.length)
      : action;
  const words = rest.split("_").filter((w) => w.length > 0);
  if (words.length === 0) {
    // The action is nothing but the toolkit prefix ("GMAIL_"): no verb to
    // conjugate, so fall back to the capitalized whole slug.
    const whole = action.split("_").filter((w) => w.length > 0);
    return whole.map(capitalizeWord).join(" ");
  }
  const [verb, ...tail] = words;
  const head = ACTION_GERUNDS[verb.toLowerCase()] ?? capitalizeWord(verb);
  return [head, ...tail.map((w) => w.toLowerCase())].join(" ");
}

/** The option label for a question step, or null when the id is unknown. */
export function optionLabel(
  step: ChatInteractionStep,
  optionId: string,
): string | null {
  if (step.kind !== "question") return null;
  return step.options?.find((o) => o.id === optionId)?.label ?? null;
}
