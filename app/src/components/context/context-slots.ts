import {
  useSaveWorkspaceContext,
  useWorkspaceContext,
} from "../../hooks/queries/use-workspace-context";
import { useAgentStore } from "../../stores/agents";
import { type ContextSlotState, contextSlotState } from "./context-slot-state";

export type ContextSlot = "workspace" | "user";

export function useContextSlot(slot: ContextSlot): {
  state: ContextSlotState;
  content: string;
  onSave: (next: string) => Promise<void>;
} {
  const agentPath = useAgentStore((s) => s.current?.folderPath);
  const agentsLoaded = useAgentStore((s) => s.loaded);
  const { data } = useWorkspaceContext(agentPath);
  const save = useSaveWorkspaceContext(agentPath);

  return {
    state: contextSlotState({ agentsLoaded, agentPath, hasData: !!data }),
    content: data?.[slot] ?? "",
    onSave: async (next: string) => {
      await save.mutateAsync({ slot, content: next });
    },
  };
}
