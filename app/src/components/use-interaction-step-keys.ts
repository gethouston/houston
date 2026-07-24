import { useEffect } from "react";

/**
 * The shared capture-phase Enter/Esc handler for an interaction step's card
 * (connect / signin / credential), which each previously carried a near-verbatim
 * copy of this window listener.
 *
 * While `enabled`, a bare Enter fires `onEnter` and a bare Escape fires
 * `onEscape` — each OPTIONAL, so a card wires only the keys it currently offers
 * (a connect step with no CTA passes no `onEnter`, and does nothing on Enter).
 * Both are ignored while focus sits in a text field, so the real composer keeps
 * its keys; and the handler runs in the CAPTURE phase and stops the event dead
 * when it acts, so Escape decides HERE instead of falling through to the global
 * Escape-closes-the-panel shortcut (use-keyboard-shortcuts.ts).
 */
export function useInteractionStepKeys(opts: {
  enabled: boolean;
  onEnter?: () => void;
  onEscape?: () => void;
}): void {
  const { enabled, onEnter, onEscape } = opts;
  useEffect(() => {
    if (!enabled) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable =
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "INPUT" ||
        target?.isContentEditable;
      if (isEditable) return;
      if (e.key === "Enter" && onEnter) {
        e.preventDefault();
        e.stopImmediatePropagation();
        onEnter();
      } else if (e.key === "Escape" && onEscape) {
        e.preventDefault();
        e.stopImmediatePropagation();
        onEscape();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [enabled, onEnter, onEscape]);
}
