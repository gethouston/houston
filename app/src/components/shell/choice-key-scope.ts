export interface ChoiceKeyScope {
  trusted: boolean;
  onScreen: boolean;
  focusWithin: boolean;
  layersAbove: number;
}

export function choiceOwnsKey(scope: ChoiceKeyScope): boolean {
  return (
    scope.trusted &&
    scope.onScreen &&
    scope.focusWithin &&
    scope.layersAbove === 0
  );
}

export interface ChoiceFocusReading {
  focusNowhere: boolean;
  focusInStep: boolean;
  targetInStep: boolean;
}

export function focusWithinStep(reading: ChoiceFocusReading): boolean {
  return reading.focusNowhere || reading.focusInStep || reading.targetInStep;
}

export interface LayerReading {
  containsStep: boolean;
  beforeStep: boolean;
}

export function countLayersAbove(layers: readonly LayerReading[]): number {
  return layers.filter((layer) => !layer.containsStep && !layer.beforeStep)
    .length;
}

const OPEN_LAYER_ROLES = ["dialog", "alertdialog", "menu", "listbox"];

export function isOpenLayerRole(role: string): boolean {
  return OPEN_LAYER_ROLES.includes(role);
}

const OPEN_LAYER_SELECTOR = '[data-state="open"][role]';

export function readChoiceKeyScope(
  step: HTMLElement | null,
  event: { target: EventTarget | null; isTrusted: boolean },
): ChoiceKeyScope {
  if (!step)
    return {
      trusted: false,
      onScreen: false,
      focusWithin: false,
      layersAbove: 0,
    };
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
    onScreen: step.getClientRects().length > 0,
    focusWithin: focusWithinStep({
      focusNowhere: active === null || active === document.body,
      focusInStep: active instanceof Node && step.contains(active),
      targetInStep: event.target instanceof Node && step.contains(event.target),
    }),
    layersAbove: countLayersAbove(layers),
  };
}
