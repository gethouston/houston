"use client";

import { useEffect } from "react";
import type { ChatInteractionStep } from "./interaction-card-logic";

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
