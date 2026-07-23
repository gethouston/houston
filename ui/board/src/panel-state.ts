import type { KanbanItem } from "./types";

/** Last selection the board managed to resolve against `items`. */
export interface ResolvedSelection {
  id: string;
  item: KanbanItem;
}

/**
 * Detail-panel visibility + header card, derived from the selection.
 *
 * Visibility keys off the SELECTION, never off the selected card's presence
 * in `items`: a selected mission can be transiently absent from the list —
 * an engine cold start holds the list read, and the refetches racing right
 * after the engine wakes can resolve before the just-created row lands — and
 * an item-presence check unmounted the whole chat panel for that window and
 * remounted it a beat later (a visible close/reopen flicker of an open chat,
 * HOU-693/HOU-730). The open conversation must outlive its card: only an
 * explicit deselect (close button, Escape, delete, agent switch) closes
 * the panel.
 *
 * While the card is absent, `panelItem` falls back to the same selection's
 * last resolved card, so the header (title, people, actions) doesn't flash
 * while the row is away. A selection that never resolved (a chat opened
 * against a still-warming engine) renders with no card until the row lands.
 */
export function resolvePanelState({
  selectedId,
  newPanelOpen,
  selectedItem,
  lastResolved,
}: {
  selectedId: string | null;
  newPanelOpen: boolean;
  selectedItem: KanbanItem | null;
  lastResolved: ResolvedSelection | null;
}): { showPanel: boolean; panelItem: KanbanItem | null } {
  const panelItem =
    selectedItem ??
    (selectedId !== null && lastResolved?.id === selectedId
      ? lastResolved.item
      : null);
  return { showPanel: selectedId !== null || newPanelOpen, panelItem };
}
