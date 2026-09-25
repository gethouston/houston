/**
 * Who a keystroke belongs to when a choice question is on screen.
 *
 * The question listens for keys on the window and the document (a filter that
 * catches the first letter typed with nothing focused cannot wait for React's
 * tree), and a listener that wide will hear keys meant for whatever opened on
 * top of it. So every one of those listeners asks this first: the question acts
 * only while it holds focus and nothing is layered over it.
 */

/** What the question knows about the key at the moment it was pressed. */
export interface ChoiceKeyScope {
  /** A person pressed it. The app also dispatches keys at itself. */
  trusted: boolean;
  focusWithin: boolean;
  /** Open layers that are NOT wrapping the question, so they own keys first. */
  layersAbove: number;
}

/**
 * An untrusted key is the app's own housekeeping, never an answer: leaving a
 * kept-alive screen fires a synthetic Escape at the document to dismiss the
 * modal portalled out of it (`keep-alive-views.tsx`). A question that takes
 * that key for its own filter leaves the modal open over an inert page.
 */
export function choiceOwnsKey(scope: ChoiceKeyScope): boolean {
  return scope.trusted && scope.focusWithin && scope.layersAbove === 0;
}

/** Where focus and the key came from, relative to the question's own element. */
export interface ChoiceFocusReading {
  /** Focus is on the document body, or on nothing at all. */
  focusNowhere: boolean;
  focusInStep: boolean;
  targetInStep: boolean;
}

/**
 * Focus parked on nothing belongs to nobody, and the question may take it: a
 * dialog that has just opened, or a click on its own background, leaves focus
 * on the body, and that is exactly the keystroke type-to-filter exists for.
 */
export function focusWithinStep(reading: ChoiceFocusReading): boolean {
  return reading.focusNowhere || reading.focusInStep || reading.targetInStep;
}

/** Where one open layer sits relative to the question. */
export interface LayerReading {
  containsStep: boolean;
  /** The layer comes earlier in the document than the question. */
  beforeStep: boolean;
}

/**
 * The sheet the question is asked in is an open layer that CONTAINS it, and it
 * is not above anything. Layers are portalled in the order they open, so one
 * that comes earlier in the document is beneath the question: the dialog a
 * card sits in, when the question is a popover that card opened. A layer
 * that comes later (a popover the question itself opened, a confirm asked
 * over it) is above it and owns Escape first.
 */
export function countLayersAbove(layers: readonly LayerReading[]): number {
  return layers.filter((layer) => !layer.containsStep && !layer.beforeStep)
    .length;
}

/**
 * The roles that take keys from whatever is under them. A confirm asked on top
 * of the question is an `alertdialog` (Radix's AlertDialog), and it owns the
 * Escape that answers it — the rule lives here, in one list, because the sweep
 * below reads the role off the element rather than spelling it a second time.
 */
const OPEN_LAYER_ROLES = ["dialog", "alertdialog", "menu", "listbox"];

export function isOpenLayerRole(role: string): boolean {
  return OPEN_LAYER_ROLES.includes(role);
}

/** Anything a layer might be: the role then says whether it takes keys. */
const OPEN_LAYER_SELECTOR = '[data-state="open"][role]';

/** Reads the scope from the live document, for the hooks to judge. */
export function readChoiceKeyScope(
  step: HTMLElement | null,
  event: { target: EventTarget | null; isTrusted: boolean },
): ChoiceKeyScope {
  if (!step) return { trusted: false, focusWithin: false, layersAbove: 0 };
  const active = document.activeElement;
  const layers = Array.from(
    document.querySelectorAll<HTMLElement>(OPEN_LAYER_SELECTOR),
  )
    .filter((layer) => isOpenLayerRole(layer.getAttribute("role") ?? ""))
    .map((layer) => ({
      containsStep: layer.contains(step),
      beforeStep: Boolean(
        layer.compareDocumentPosition(step) & Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    }));
  return {
    trusted: event.isTrusted,
    focusWithin: focusWithinStep({
      focusNowhere: active === null || active === document.body,
      focusInStep: active instanceof Node && step.contains(active),
      targetInStep: event.target instanceof Node && step.contains(event.target),
    }),
    layersAbove: countLayersAbove(layers),
  };
}
