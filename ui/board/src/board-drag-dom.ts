const CARD_ID_ATTR = "data-kanban-card";
const CARD_DRAGGABLE_ATTR = "data-kanban-draggable";
const COLUMN_ID_ATTR = "data-kanban-column";

const INTERACTIVE_SELECTOR =
  "button, input, textarea, select, a, [role='checkbox']";

const DRAGGING_CLASS = "kanban-dragging";
const FORBIDDEN_CLASS = "kanban-dragging-forbidden";

export function draggableCardAt(
  target: EventTarget | null,
): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  if (target.closest(INTERACTIVE_SELECTOR)) return null;
  return target.closest<HTMLElement>(`[${CARD_DRAGGABLE_ATTR}]`);
}

export function cardIdOf(card: HTMLElement): string | null {
  return card.getAttribute(CARD_ID_ATTR);
}

export function columnIdAt(x: number, y: number): string | null {
  return (
    document
      .elementFromPoint(x, y)
      ?.closest(`[${COLUMN_ID_ATTR}]`)
      ?.getAttribute(COLUMN_ID_ATTR) ?? null
  );
}

export function startDragCursor(): void {
  document.body.classList.add(DRAGGING_CLASS);
  window.getSelection()?.removeAllRanges();
}

export function setDragForbidden(forbidden: boolean): void {
  document.body.classList.toggle(FORBIDDEN_CLASS, forbidden);
}

export function endDragCursor(): void {
  document.body.classList.remove(DRAGGING_CLASS, FORBIDDEN_CLASS);
}

let ghostEl: HTMLElement | null = null;
let ghostOffsetX = 0;
let ghostOffsetY = 0;

function positionGhost(pointerX: number, pointerY: number): void {
  if (ghostEl) {
    ghostEl.style.transform = `translate(${pointerX - ghostOffsetX}px, ${pointerY - ghostOffsetY}px)`;
  }
}

export function createDragGhost(
  source: HTMLElement,
  pointerX: number,
  pointerY: number,
): void {
  removeDragGhost();
  const rect = source.getBoundingClientRect();
  ghostOffsetX = pointerX - rect.left;
  ghostOffsetY = pointerY - rect.top;
  const clone = source.cloneNode(true) as HTMLElement;
  clone.removeAttribute(CARD_ID_ATTR);
  clone.removeAttribute(CARD_DRAGGABLE_ATTR);
  clone.setAttribute("aria-hidden", "true");
  Object.assign(clone.style, {
    position: "fixed",
    top: "0px",
    left: "0px",
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: "0",
    pointerEvents: "none",
    zIndex: "9999",
    opacity: "0.9",
    boxShadow: "var(--ht-shadow-drag)",
    transition: "none",
  });
  positionGhost(pointerX, pointerY);
  document.body.appendChild(clone);
  ghostEl = clone;
}

export function moveDragGhost(pointerX: number, pointerY: number): void {
  positionGhost(pointerX, pointerY);
}

export function removeDragGhost(): void {
  ghostEl?.remove();
  ghostEl = null;
}
