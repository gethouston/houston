/**
 * DOM glue for the board's pointer-events card drag (see use-board-drag). Kept
 * apart from the React hook so the hit-testing + cursor concerns stay pure and
 * independently testable. The components set the matching literal attributes
 * (`data-kanban-card` / `data-kanban-draggable` on a card root,
 * `data-kanban-column` on a column root) — TypeScript only allows a hyphenated
 * `data-*` name as a literal JSX attribute, not via object spread, so the names
 * live here for the query side and as literals there.
 */

const CARD_ID_ATTR = "data-kanban-card"
const CARD_DRAGGABLE_ATTR = "data-kanban-draggable"
const COLUMN_ID_ATTR = "data-kanban-column"

/** Controls inside a card whose own click/press must win — a press here never
 *  starts a card drag. */
const INTERACTIVE_SELECTOR =
  "button, input, textarea, select, a, [role='checkbox']"

/** Drives the global drag cursor; see the `body.kanban-dragging` rules in
 *  globals.css. One cursor on every OS because the board owns the drag. */
const DRAGGING_CLASS = "kanban-dragging"
const FORBIDDEN_CLASS = "kanban-dragging-forbidden"

/** The draggable card root under `target`, or null — also null when the press
 *  landed on an interactive control that owns its own gesture. */
export function draggableCardAt(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null
  if (target.closest(INTERACTIVE_SELECTOR)) return null
  return target.closest<HTMLElement>(`[${CARD_DRAGGABLE_ATTR}]`)
}

/** The mission id a card root carries. */
export function cardIdOf(card: HTMLElement): string | null {
  return card.getAttribute(CARD_ID_ATTR)
}

/** Id of the column at viewport point (x, y), or null. */
export function columnIdAt(x: number, y: number): string | null {
  return (
    document
      .elementFromPoint(x, y)
      ?.closest(`[${COLUMN_ID_ATTR}]`)
      ?.getAttribute(COLUMN_ID_ATTR) ?? null
  )
}

/** Begin the global drag cursor and drop any text selection the press started. */
export function startDragCursor(): void {
  document.body.classList.add(DRAGGING_CLASS)
  window.getSelection()?.removeAllRanges()
}

/** Swap the cursor to `not-allowed` over a forbidden section (and back). */
export function setDragForbidden(forbidden: boolean): void {
  document.body.classList.toggle(FORBIDDEN_CLASS, forbidden)
}

/** Clear the global drag cursor (drag ended, cancelled, or unmounted). */
export function endDragCursor(): void {
  document.body.classList.remove(DRAGGING_CLASS, FORBIDDEN_CLASS)
}

// A single floating clone of the card follows the cursor during a drag (native
// HTML5 DnD drew this "drag image" for free; the pointer drag has to render it).
// Module-level singleton — only one card drags at a time.
let ghostEl: HTMLElement | null = null
let ghostOffsetX = 0
let ghostOffsetY = 0

function positionGhost(pointerX: number, pointerY: number): void {
  if (ghostEl) {
    ghostEl.style.transform = `translate(${pointerX - ghostOffsetX}px, ${pointerY - ghostOffsetY}px)`
  }
}

/** Clone `source` into a fixed, click-through ghost pinned under the cursor at
 *  the same grab point. Appended to `<body>`; the theme attribute lives on
 *  `<html>`, so it inherits light/dark + CSS vars. */
export function createDragGhost(
  source: HTMLElement,
  pointerX: number,
  pointerY: number,
): void {
  removeDragGhost()
  const rect = source.getBoundingClientRect()
  ghostOffsetX = pointerX - rect.left
  ghostOffsetY = pointerY - rect.top
  const clone = source.cloneNode(true) as HTMLElement
  clone.removeAttribute(CARD_ID_ATTR)
  clone.removeAttribute(CARD_DRAGGABLE_ATTR)
  clone.setAttribute("aria-hidden", "true")
  Object.assign(clone.style, {
    position: "fixed",
    top: "0px",
    left: "0px",
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: "0",
    // Click-through so `elementFromPoint` hit-tests the column underneath and
    // the global drag cursor (not the card's) shows.
    pointerEvents: "none",
    zIndex: "9999",
    opacity: "0.9",
    boxShadow: "0 12px 32px rgba(0, 0, 0, 0.22)",
    transition: "none",
  })
  positionGhost(pointerX, pointerY)
  document.body.appendChild(clone)
  ghostEl = clone
}

/** Move the ghost to follow the cursor. */
export function moveDragGhost(pointerX: number, pointerY: number): void {
  positionGhost(pointerX, pointerY)
}

/** Remove the ghost (drag ended, cancelled, or unmounted). */
export function removeDragGhost(): void {
  ghostEl?.remove()
  ghostEl = null
}
