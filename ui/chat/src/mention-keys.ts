/**
 * Which key an OPEN @mention list consumes, and what it means (HOU-944).
 * Pure, no React — so the rules (above all the IME one) are testable without
 * a browser.
 */

export type MentionKeyAction =
  | { kind: "move"; step: number }
  | { kind: "dismiss" }
  | { kind: "accept" };

/** The slice of a keydown the list cares about. */
export interface MentionKeyEvent {
  key: string;
  shiftKey: boolean;
  /** True while an IME composition is in flight. */
  isComposing: boolean;
}

/**
 * The action `event` triggers on a list of `count` rows, or null to let the
 * key through untouched.
 *
 * MID-COMPOSITION THE LIST TAKES NOTHING. Every key it wants belongs to the
 * IME candidate window first: Arrow moves through THAT list, Escape cancels
 * the composition, Enter and Tab commit the reading. Intercepting any of them
 * makes the composer unusable in Japanese, Chinese or Korean — the user's
 * candidate selection silently becomes a teammate's name.
 */
export function mentionKeyAction(
  event: MentionKeyEvent,
  count: number,
): MentionKeyAction | null {
  if (count <= 0 || event.isComposing) return null;
  if (event.key === "ArrowDown") return { kind: "move", step: 1 };
  // Wrapping backwards, expressed as a forward step, so the caller can stay a
  // single modulo.
  if (event.key === "ArrowUp") return { kind: "move", step: count - 1 };
  if (event.key === "Escape") return { kind: "dismiss" };
  if (event.key === "Tab") return { kind: "accept" };
  // Shift+Enter is a newline in the composer, never a pick.
  if (event.key === "Enter" && !event.shiftKey) return { kind: "accept" };
  return null;
}
