import { type KeyboardEvent, type RefObject, useEffect, useRef } from "react";
import {
  groupIntoRows,
  isChipGridKey,
  nextChipIndex,
} from "./choice-grid-model";
import { choiceOwnsKey, readChoiceKeyScope } from "./choice-key-scope";

export const CHIP_ATTR = "data-choice-chip";

function isTypingSurface(node: EventTarget | null): boolean {
  return (
    node instanceof HTMLInputElement ||
    node instanceof HTMLTextAreaElement ||
    (node instanceof HTMLElement && node.isContentEditable)
  );
}

export function useChipGrid() {
  const ref = useRef<HTMLDivElement>(null);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (!isChipGridKey(event.key)) return;
    const container = ref.current;
    if (!container) return;
    const chips = Array.from(
      container.querySelectorAll<HTMLButtonElement>(`[${CHIP_ATTR}]`),
    );
    const index = chips.indexOf(document.activeElement as HTMLButtonElement);
    if (index === -1) return;
    const rows = groupIntoRows(
      chips.map((chip) => Math.round(chip.getBoundingClientRect().top)),
    );
    const next = nextChipIndex(event.key, index, rows);
    if (next === null) return;
    event.preventDefault();
    chips[next].focus();
  };

  return { ref, onKeyDown };
}

export function useTypeToSearch(
  step: RefObject<HTMLElement | null>,
  enabled: boolean,
  onType: (character: string) => void,
) {
  const handler = useRef(onType);
  handler.current = onType;

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.length !== 1 || event.key === " ") return;
      if (isTypingSurface(event.target)) return;
      if (!choiceOwnsKey(readChoiceKeyScope(step.current, event))) return;
      event.preventDefault();
      handler.current(event.key);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enabled, step]);
}

export function useEscapeWithin(
  step: RefObject<HTMLElement | null>,
  onEscape: () => boolean,
) {
  const handler = useRef(onEscape);
  handler.current = onEscape;

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (event.isComposing) return;
      if (!choiceOwnsKey(readChoiceKeyScope(step.current, event))) return;
      if (!handler.current()) return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [step]);
}

export function useLeaveWithFocus(
  active: boolean,
  returnTo: RefObject<HTMLElement | null>,
  onLeave: () => void,
): () => void {
  const returning = useRef(false);

  useEffect(() => {
    if (active || !returning.current) return;
    returning.current = false;
    returnTo.current?.focus();
  }, [active, returnTo]);

  return () => {
    returning.current = true;
    onLeave();
  };
}
