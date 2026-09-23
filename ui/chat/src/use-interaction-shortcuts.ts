"use client";

import { useEffect } from "react";
import type { ChatInteractionStep } from "./interaction-card-logic";

/**
 * Number-key shortcuts (1, 2, 3...) select the matching option row, and Esc
 * declines the question (mirroring the footer's Esc hint) — both only on a live
 * question step and while focus is NOT in a text field, so typing into the
 * free-text answer or the real composer is unaffected. Esc runs in the CAPTURE
 * phase and stops the event dead so it decides "not now" here instead of
 * falling through to the global Escape-closes-the-panel shortcut.
 */
export function useInteractionShortcuts({
  step,
  active,
  onOption,
  onSkip,
}: {
  step: ChatInteractionStep | undefined;
  active: boolean;
  onOption: (optionId: string) => void;
  onSkip: () => void;
}): void {
  useEffect(() => {
    if (!active || step?.kind !== "question") return;
    const options = step.options ?? [];
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable =
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "INPUT" ||
        target?.isContentEditable;
      if (isEditable) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        onSkip();
        return;
      }
      const option = options[Number(e.key) - 1];
      if (!option) return;
      e.preventDefault();
      onOption(option.id);
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [active, step, onOption, onSkip]);
}
