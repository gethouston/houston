import type { AssistantHandle } from "../../lib/tauri";
import type { Agent } from "../../lib/types";

export const ASSISTANT_AGENT_COLOR = "navy";

export function assistantAgent(handle: AssistantHandle, name: string): Agent {
  return {
    id: handle.agent,
    name,
    folderPath: handle.agent,
    configId: handle.agent,
    color: ASSISTANT_AGENT_COLOR,
    createdAt: "",
  };
}
