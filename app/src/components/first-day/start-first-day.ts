import { startEmployeeFirstDay } from "../../lib/agent-first-day";
import type { Agent } from "../../lib/types";

export function startFirstDay(agent: Agent): Promise<boolean> {
  return startEmployeeFirstDay({
    id: agent.id,
    name: agent.name,
    folderPath: agent.folderPath,
  });
}
