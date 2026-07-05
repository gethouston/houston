import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { analytics } from "../../lib/analytics";
import { tauriAgents, tauriProvider, tauriWorkspaces } from "../../lib/tauri";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useWorkspaceStore } from "../../stores/workspaces";
import { createPersonalAssistantForWorkspace } from "./create-personal-assistant";
import { ensureWorkspaceWithAssistant } from "./ensure-default-assistant";
import {
  buildAssistantInstructions,
  defaultAssistantSetup,
} from "./personal-assistant-artifacts";

interface UseCreateAssistantArgs {
  assistantName: string;
  assistantColor: string;
  /** Title stamped on the agent's first-run instructions. */
  missionTitle: string;
}

/**
 * Provisions the default workspace + personal assistant for first-run, and owns
 * the created agent (the email step needs it). Extracted from the orchestrator
 * to keep it under the file cap.
 *
 * `create` collapses concurrent / repeated calls onto ONE in-flight operation
 * so first-run can never fire `createWorkspace` twice — a double-clicked
 * Continue or a remount reuses the same promise (HOU-444).
 */
export function useCreateAssistant({
  assistantName,
  assistantColor,
  missionTitle,
}: UseCreateAssistantArgs): {
  agent: Agent | null;
  creating: boolean;
  create: (provider: string, model: string) => Promise<Agent>;
} {
  const { t } = useTranslation("setup");
  const [agent, setAgent] = useState<Agent | null>(null);
  const [creating, setCreating] = useState(false);
  const creationRef = useRef<Promise<Agent> | null>(null);

  const createWorkspaceAndAssistant = (
    pickedProvider: string,
    pickedModel: string,
  ): Promise<Agent> => {
    if (creationRef.current) return creationRef.current;

    const op = (async (): Promise<Agent> => {
      const setup = defaultAssistantSetup({
        workspaceName: t("tutorial.defaults.workspaceName"),
        assistantName:
          assistantName.trim() || t("tutorial.defaults.assistantName"),
        focus: t("tutorial.defaults.focus"),
        approvalRule: t("tutorial.defaults.approvalRule"),
      });
      setup.color = assistantColor;

      const {
        workspace: ws,
        assistant: created,
        createdWorkspace,
      } = await ensureWorkspaceWithAssistant(setup.workspaceName, {
        listWorkspaces: () => tauriWorkspaces.list(),
        createWorkspace: (name) => tauriWorkspaces.create(name),
        listAgents: (workspaceId) => tauriAgents.list(workspaceId),
        createAssistant: (workspaceId) =>
          createPersonalAssistantForWorkspace(workspaceId, {
            name: setup.assistantName.trim(),
            instructions: buildAssistantInstructions(setup, missionTitle),
            color: setup.color,
            provider: pickedProvider,
            model: pickedModel,
          }),
      });

      await tauriProvider.setLastUsed(pickedProvider, pickedModel);
      if (createdWorkspace) {
        analytics.track("workspace_created", {
          provider: pickedProvider,
          source: "onboarding",
        });
      }
      await useWorkspaceStore.getState().loadWorkspaces();
      useWorkspaceStore.getState().setCurrent(ws);
      await useAgentStore.getState().loadAgents(ws.id);
      const refreshed =
        useAgentStore.getState().agents.find((a) => a.id === created.id) ??
        created;
      useAgentStore.getState().setCurrent(refreshed);
      setAgent(refreshed);
      return refreshed;
    })();

    creationRef.current = op;
    op.catch(() => {
      creationRef.current = null;
    });
    return op;
  };

  const create = async (provider: string, model: string): Promise<Agent> => {
    setCreating(true);
    try {
      return await createWorkspaceAndAssistant(provider, model);
    } finally {
      setCreating(false);
    }
  };

  return { agent, creating, create };
}
