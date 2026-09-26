/**
 * Hiring an AI Employee with no screen attached: create it, born with its
 * provider/model pin and its first day pending. It joins the sidebar as a
 * top-level employee; grouping it is the person's own arrangement. The
 * create dialog and any flow that hires on the user's behalf share it; what to
 * show afterwards (opening the board) stays with the caller.
 *
 * The pin and the pending first day ride the create itself, so they exist the
 * moment the employee does: nothing is left to write after a hosted pod
 * wakes, or to land on a folder a rename already moved. The first day never
 * starts here. It waits for the user's own click (`agent-first-day.ts`).
 */

import { useAgentStore } from "../stores/agents";
import {
  type AgentRoleContext,
  buildAgentRoleJobDescription,
} from "./agent-role-context";
import type { KickoffPin } from "./kickoff-pin";

export { nextFreeAgentColor } from "./next-agent-color";

export interface CreatedEmployee {
  id: string;
  name: string;
  color?: string;
  folderPath: string;
}

export interface CreateEmployeeInput {
  workspaceId: string;
  /** Checked beforehand with `agentNameIssue`; the host still refuses a
   *  duplicate that raced in, as an `isAgentNameConflictError`. */
  name: string;
  color: string | undefined;
  brief: AgentRoleContext;
  pin: KickoffPin;
  /** An installed template the employee starts from. */
  template?: { installedPath?: string; seeds?: Record<string, string> };
}

/** Create the employee. Rejects when the create itself fails. */
export async function createEmployee(
  input: CreateEmployeeInput,
): Promise<CreatedEmployee> {
  const { agent } = await useAgentStore
    .getState()
    .create(
      input.workspaceId,
      input.name.trim(),
      "blank",
      input.color,
      buildAgentRoleJobDescription(input.brief),
      input.template?.installedPath,
      input.template?.seeds,
      undefined,
      { ...input.pin, firstDay: "pending", arrival: "created" },
    );
  return {
    id: agent.id,
    name: agent.name,
    color: agent.color,
    folderPath: agent.folderPath,
  };
}
