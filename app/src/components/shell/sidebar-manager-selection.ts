import { ASSISTANT_VIEW_ID } from "../assistant/id";

export function bandSelectedId(
  viewMode: string,
  selectedAgentId: string | null,
): string | null {
  return viewMode === ASSISTANT_VIEW_ID ? ASSISTANT_VIEW_ID : selectedAgentId;
}

export function routeBandSelect(
  id: string,
  to: { openManager: () => void; selectAgent: (agentId: string) => void },
): void {
  if (id === ASSISTANT_VIEW_ID) to.openManager();
  else to.selectAgent(id);
}
