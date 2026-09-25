import { startEmployeeFirstDay } from "../../lib/agent-first-day";
import type { Agent } from "../../lib/types";

/**
 * Start one employee's first day from a start button. Every button may press
 * at once, from any board or tab: the host starts ONE setup task and hands it
 * back to every other press. Resolves whether the task is open.
 */
export function startFirstDay(agent: Agent): Promise<boolean> {
  return startEmployeeFirstDay({
    id: agent.id,
    name: agent.name,
    folderPath: agent.folderPath,
  });
}
