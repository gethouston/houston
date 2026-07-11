// Shared data types + stateless value helpers for ChatInteractionCard. DOM-free
// so the node:test suite can import them; the stepper state machine in
// interaction-card-logic.ts builds on these, and the .tsx component re-uses them.

export interface ChatInteractionOption {
  id: string;
  label: string;
  /** One short line of consequence/benefit, shown muted INLINE after the label
   *  (single line, truncated). Optional: older steps without it render as before. */
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
  | { kind: "connect"; id: string; toolkit: string; reason?: string };

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

/** The option label for a question step, or null when the id is unknown. */
export function optionLabel(
  step: ChatInteractionStep,
  optionId: string,
): string | null {
  if (step.kind !== "question") return null;
  return step.options?.find((o) => o.id === optionId)?.label ?? null;
}
