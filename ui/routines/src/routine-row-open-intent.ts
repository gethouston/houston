/**
 * When a click or a keypress on a routine row means "open this routine".
 *
 * Both answers are subtler than they look, and both were bugs (PRODUCT-1208),
 * so they live here as pure predicates the row calls — testable without a DOM
 * event, and impossible to re-inline by accident.
 */

/**
 * A click is an open intent only when its target sits physically INSIDE the
 * row. Clicks bubbling from PORTALED children — the kebab menu's items, the
 * delete confirm dialog's buttons — reach the row's handler through the REACT
 * tree while their DOM node sits under `document.body`. Opening on those turned
 * "Run now", and cancelling a delete, into a navigation.
 */
export function clickOpensRow(row: Node, target: EventTarget | null): boolean {
  // `Node.contains(null)` is defined as false, so a missing target needs no
  // special case (and no `instanceof Node`, which assumes a DOM global).
  return row.contains(target as Node | null);
}

/**
 * Only the row ITSELF opens on Enter/Space. Key events from a focused inner
 * control (the enable switch, the kebab) bubble to the same handler but carry a
 * different target, and pressing Space on a switch must toggle it, not navigate.
 */
export function keyOpensRow(
  key: string,
  target: EventTarget | null,
  row: EventTarget,
): boolean {
  return target === row && (key === "Enter" || key === " ");
}
