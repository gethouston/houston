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
  kind?: "choice" | "approval";
  id: string;
  label: string;
  /** An optional one-line explanation, shown as a small muted line under the
   *  label (always visible, so it works on touch). Only when present: a row
   *  without it keeps the single-line layout. */
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
      /** Verbatim material the question is about, too long or too multi-line to
       *  sit in the question line: shown under it in its own scrollable
       *  monospaced block (`interaction-detail.tsx`). */
      detail?: string;
      /** Presentational facts for a proposed AI Employee hire. */
      hire?: {
        color?: string;
        role?: string;
        instructions?: string;
        instructionsLabel?: string;
      };
      options?: ChatInteractionOption[];
      /** Hide the free-text escape row so the option rows are the ONLY way to
       *  answer. Meaningful only when `options` are present — a free-text-only
       *  question ignores it (the field IS the answer). */
      hideFreeText?: boolean;
      /** The question is answered with a file: a large upload area sits above
       *  the answer row (only when the card shares a ChatPanel's attachment
       *  list, so the files have somewhere to go). The answer field always
       *  shows, `hideFreeText` notwithstanding: its send is how files alone
       *  answer. */
      wantsFiles?: boolean;
      /** A presentational app-identity lockup: when the question concerns an
       *  integration, the app resolves the toolkit to this brand so the modal's
       *  title shows the app's logo + name (like the connect card) and the
       *  question text moves into the body. Absent = a plain question (text in
       *  the title). ui/chat never resolves it — the app does. */
      brand?: ChatInteractionBrand;
    }
  | { kind: "signin"; id: string; reason?: string }
  | {
      kind: "connect";
      id: string;
      toolkit: string;
      reason?: string;
      /** The app IS connected but its login stopped working (an action was
       *  refused as expired, revoked or missing a permission): the card asks
       *  to reconnect and never counts the existing connection as done. */
      reconnect?: boolean;
      /** With `reconnect`: ISO time the app refused the login. Only a
       *  connection created after it counts as the reconnect, wherever the
       *  user made it (this card or the Integrations page). */
      refusedAt?: string;
    }
  | { kind: "credential"; id: string; toolkit: string; reason?: string }
  | { kind: "custom"; id: string; title: string };

export type ChatInteractionAnswerSource =
  | { source: "option"; optionId: string }
  | { source: "text" };

export type ChatInteractionAnswer = {
  stepId: string;
  question: string;
  answer: string;
} & ChatInteractionAnswerSource;

export function hasSelectableOptions(
  options?: ChatInteractionOption[],
): boolean {
  return Array.isArray(options) && options.length > 0;
}

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

export function optionLabel(
  step: ChatInteractionStep,
  optionId: string,
): string | null {
  if (step.kind !== "question") return null;
  return step.options?.find((o) => o.id === optionId)?.label ?? null;
}
