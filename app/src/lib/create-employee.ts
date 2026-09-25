/**
 * Hiring an AI Employee with no screen attached: create it, born with its
 * provider/model pin and its first day pending, and file it in its team. The
 * create dialog and any flow that hires on the user's behalf share it; what to
 * show afterwards (opening the board) stays with the caller.
 *
 * The pin and the pending first day ride the create itself, so they exist the
 * moment the employee does: nothing is left to write after a hosted pod
 * wakes, or to land on a folder a rename already moved. The first day never
 * starts here. It waits for the user's own click (`agent-first-day.ts`).
 */

import { useMoveAgentToTeam } from "../hooks/queries";
import { useCapabilities } from "../hooks/use-capabilities";
import { useSidebarLayout } from "../hooks/use-sidebar-layout";
import { useAgentStore } from "../stores/agents";
import { useWorkspaceStore } from "../stores/workspaces";
import {
  type AgentRoleContext,
  buildAgentRoleJobDescription,
} from "./agent-role-context";
import { logAndReportError } from "./error-report";
import { showExpectedStateToast } from "./error-toast";
import i18n from "./i18n";
import type { KickoffPin } from "./kickoff-pin";
import { newAgentPlacement } from "./new-agent-placement";
import { hasAgentTeams } from "./org-roles";

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
  /** `null` files the employee in the default team. */
  teamId: string | null;
  pin: KickoffPin;
  /** An installed template the employee starts from. */
  template?: { installedPath?: string; seeds?: Record<string, string> };
}

/** Files a created employee in a team; bound by `useEmployeePlacer`. */
export type EmployeePlacer = (
  agent: Pick<CreatedEmployee, "id" | "name">,
  teamId: string | null,
) => Promise<void>;

/**
 * Create the employee and file it in its team. Rejects when the create itself
 * fails; a failed placement is reported and explained by the placer, since
 * the employee exists and works regardless.
 */
export async function createEmployee(
  input: CreateEmployeeInput,
  place: EmployeePlacer,
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
  await place(agent, input.teamId);
  return {
    id: agent.id,
    name: agent.name,
    color: agent.color,
    folderPath: agent.folderPath,
  };
}

/** The team placement `createEmployee` needs, bound to the current workspace
 *  and to whichever backend holds its teams. */
export function useEmployeePlacer(): EmployeePlacer {
  const workspaceId = useWorkspaceStore((s) => s.current?.id);
  const { capabilities } = useCapabilities();
  const serverBacked = hasAgentTeams(capabilities);
  const sidebar = useSidebarLayout(workspaceId);
  const moveToTeam = useMoveAgentToTeam();

  return async (agent, teamId) => {
    const placement = newAgentPlacement(teamId, serverBacked);
    if (placement.kind === "server") {
      try {
        await moveToTeam.mutateAsync({
          agentId: agent.id,
          teamId: placement.teamId,
        });
      } catch (err) {
        // The employee exists and works; only its place is wrong. The user
        // asked for a team and will go looking for it there, so say where it
        // landed instead of leaving them to find one that seems missing.
        logAndReportError("new_agent_placement", err);
        showExpectedStateToast(
          i18n.t("agentOnboarding:roleSetup.placementFailedTitle"),
          i18n.t("agentOnboarding:roleSetup.placementFailedBody", {
            name: agent.name,
          }),
        );
      }
    } else if (placement.kind === "local") {
      // OPTIMISTIC, with nothing to await: the layout write rolls the sidebar
      // back and surfaces its own failure from inside `useSidebarLayout`.
      sidebar.moveItem(agent.id, {
        groupId: placement.groupId,
        beforeItemId: null,
      });
    }
  };
}
