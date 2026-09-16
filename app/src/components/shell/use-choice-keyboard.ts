import { type KeyboardEvent, type RefObject, useEffect, useRef } from "react";
import {
  groupIntoRows,
  isChipGridKey,
  nextChipIndex,
} from "./choice-grid-model";
import { choiceOwnsKey, readChoiceKeyScope } from "./choice-key-scope";

/** Marks a chip as a stop of the question's arrow grid. */
export const CHIP_ATTR = "data-choice-chip";

function isTypingSurface(node: EventTarget | null): boolean {
  return (
    node instanceof HTMLInputElement ||
    node instanceof HTMLTextAreaElement ||
    (node instanceof HTMLElement && node.isContentEditable)
  );
}

/**
 * Arrow-key movement over every chip of a question, measured live: the rows
 * only exist once the run has wrapped, and they change with the dialog's
 * width, so they are read at the moment of the keypress rather than tracked.
 */
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

/**
 * Typing anywhere on a searchable question goes to the search field, carrying
 * the character that started it. Filtering a long list is the reflex a keyboard
 * user arrives with, and making them find the field first is the thing that
 * makes a picker feel slow.
 *
 * Listens on the document because the keystroke that matters most is the one
 * fired with nothing focused, which never reaches a React handler — and asks
 * `choice-key-scope.ts` whether the question owns that key, so a letter typed
 * into the command palette is not stolen into the filter behind it.
 */
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
      // Space activates the focused chip, and a lone modifier is not a letter.
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

/**
 * Escape belongs to the question before it belongs to the dialog around it:
 * clearing a query, or leaving a typed answer, must never also throw away the
 * questions behind it. The handler says whether it took the key; a step with
 * nothing left to undo hands it back, and the dialog closes as it always did.
 *
 * Listens on the WINDOW in the capture phase, which is the one place that runs
 * before Radix's dismissable layer — it reads Escape from a capture listener
 * on the document, so a handler on the field itself meets a dialog that is
 * already gone, and one registered later on the document loses the race by the
 * order it happened to mount in. Running that early is exactly why it must ask
 * `choice-key-scope.ts` first: whatever opened ON TOP of the question closes
 * on Escape before the question undoes anything of its own.
 */
export function useEscapeWithin(
  step: RefObject<HTMLElement | null>,
  onEscape: () => boolean,
) {
  const handler = useRef(onEscape);
  handler.current = onEscape;

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // An IME's Escape abandons the characters being composed, nothing more.
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

/**
 * Leaving a state hands focus back to the control that opened it — and that
 * control often only exists again once the leaving has rendered, so the focus
 * waits for the commit rather than reaching for a button that is not there.
 */
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
