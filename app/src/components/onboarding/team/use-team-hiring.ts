import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAgentActions } from "../../../hooks/use-agent-actions";
import { useKickoffPinResolver } from "../../../hooks/use-kickoff-pin-resolver";
import { useSidebarLayout } from "../../../hooks/use-sidebar-layout";
import { isAgentNameConflictError } from "../../../lib/agent-name-conflict";
import {
  type AgentRoleContext,
  withAgentRoleContext,
} from "../../../lib/agent-role-context";
import {
  createEmployee,
  nextFreeAgentColor,
} from "../../../lib/create-employee";
import { logAndReportError } from "../../../lib/error-report";
import { queryKeys } from "../../../lib/query-keys";
import { tauriAgent } from "../../../lib/tauri";
import { useAgentProvisioningStore } from "../../../stores/agent-provisioning";
import { useAgentStore } from "../../../stores/agents";
import type { RosterSettlement } from "./team-roster-model";
import type { RosterSaveHost } from "./team-roster-save";

export interface TeamHiring extends RosterSaveHost {
  /** Every AI Employee name in the workspace, hires from this card included. */
  takenNames: string[];
  /** The palette color no teammate wears yet, read at the moment of asking.
   *  `alsoTaken` counts colors already promised to hires not made yet. */
  nextColor: (alsoTaken?: readonly string[]) => string;
  hire: (input: {
    name: string;
    color: string | undefined;
    brief: AgentRoleContext;
  }) => Promise<RosterSettlement>;
}

/**
 * Hiring into the workspace the card was opened for. Each hire joins the
 * sidebar as a top-level AI Employee: "your team" is everyone hired, never a
 * group made on the person's behalf.
 *
 * Each employee's first day stays pending (`createEmployee`): the card only
 * builds the team, and each one starts when the person opens them. The store
 * adopts every hire as it lands, which is what keeps both the name check and
 * the next free color honest across a run of hires.
 */
export function useTeamHiring(workspaceId: string): TeamHiring {
  const agents = useAgentStore((s) => s.agents);
  const resolvePin = useKickoffPinResolver();
  const { t } = useTranslation("agents");
  const queryClient = useQueryClient();
  const sidebar = useSidebarLayout(workspaceId);
  // The same rename and recolor the agent's own "Color & name" settings use.
  const actions = useAgentActions({
    t,
    workspaceId,
    agentNamesById: agents,
    remapAgentId: sidebar.remapAgentId,
  });

  return {
    takenNames: agents.map((agent) => agent.name),
    nextColor: (alsoTaken = []) =>
      nextFreeAgentColor([
        ...useAgentStore.getState().agents.map((agent) => agent.color),
        ...alsoTaken,
      ]),
    hire: async ({ name, color, brief }) => {
      try {
        const created = await createEmployee({
          workspaceId,
          name,
          color,
          brief,
          pin: await resolvePin(),
        });
        return { kind: "hired", id: created.id, name: created.name };
      } catch (err) {
        if (isAgentNameConflictError(err)) {
          return { kind: "failed", reason: "nameTaken" };
        }
        // The create call reports its own failures; this catches the ones
        // around it (the pin lookup) and skips a repeat.
        logAndReportError("team_card_hire", err);
        return { kind: "failed", reason: "failed" };
      }
    },
    whenReady: whenAgentTakesWrites,
    rename: async (id, name) => (await actions.rename(id, name)) ?? null,
    recolor: (id, color) => actions.changeColor(id, color),
    // The Job description tab's own read and write of the file, so the tab,
    // the first day's greeting and the agent all read the new brief.
    rebrief: async (id, brief) => {
      const agent = useAgentStore.getState().agents.find((a) => a.id === id);
      if (!agent) {
        const err = new Error(`hired AI Employee ${id} left the workspace`);
        logAndReportError("team_card_rebrief", err);
        throw err;
      }
      const path = agent.folderPath;
      const text = await tauriAgent.readFile(path, "CLAUDE.md");
      await tauriAgent.writeFile(
        path,
        "CLAUDE.md",
        withAgentRoleContext(text, brief),
      );
      await queryClient.invalidateQueries({
        queryKey: queryKeys.instructions(path),
      });
    },
  };
}

/** Resolves once the employee's engine takes writes: a hosted employee warms
 *  up after its create, and the write guard refuses every write until then. */
function whenAgentTakesWrites(id: string): Promise<void> {
  const ready = () => !useAgentProvisioningStore.getState().provisioning[id];
  if (ready()) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = useAgentProvisioningStore.subscribe(() => {
      if (!ready()) return;
      unsubscribe();
      resolve();
    });
  });
}
