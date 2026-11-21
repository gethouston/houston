import { isAgentNameTaken } from "@houston/sdk";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAgentActions } from "../../../hooks/use-agent-actions";
import { useKickoffPinResolver } from "../../../hooks/use-kickoff-pin-resolver";
import { useSidebarLayout } from "../../../hooks/use-sidebar-layout";
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
  takenNames: string[];
  nextColor: (alsoTaken?: readonly string[]) => string;
  hire: (input: {
    name: string;
    color: string | undefined;
    brief: AgentRoleContext;
  }) => Promise<RosterSettlement>;
}

export function useTeamHiring(workspaceId: string): TeamHiring {
  const agents = useAgentStore((s) => s.agents);
  const resolvePin = useKickoffPinResolver();
  const { t } = useTranslation("agents");
  const queryClient = useQueryClient();
  const sidebar = useSidebarLayout(workspaceId);
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
        if (isAgentNameTaken(err)) {
          return { kind: "failed", reason: "nameTaken" };
        }
        logAndReportError("team_card_hire", err);
        return { kind: "failed", reason: "failed" };
      }
    },
    whenReady: whenAgentTakesWrites,
    rename: async (id, name) => (await actions.rename(id, name)) ?? null,
    recolor: (id, color) => actions.changeColor(id, color),
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
