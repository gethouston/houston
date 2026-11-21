import type { KanbanItem } from "./types";

export interface ResolvedSelection {
  id: string;
  item: KanbanItem;
}

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
