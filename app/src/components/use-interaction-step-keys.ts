import { useEffect } from "react";

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
