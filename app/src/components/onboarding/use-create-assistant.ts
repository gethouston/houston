import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { seedTimezoneIfUnset } from "../../hooks/use-timezone-preference";
import { analytics } from "../../lib/analytics";
import { logger } from "../../lib/logger";
import { tauriAgents, tauriProvider, tauriWorkspaces } from "../../lib/tauri";
import type { Agent, Workspace } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useWorkspaceStore } from "../../stores/workspaces";
import { createPersonalAssistantForWorkspace } from "./create-personal-assistant";
import {
  type EnsuredWorkspace,
  ensureWorkspaceWithAssistant,
} from "./ensure-default-assistant";
import { surfaceAgentThenRefresh } from "./first-run-provision";
import {
  buildAssistantInstructions,
  defaultAssistantSetup,
} from "./personal-assistant-artifacts";
import { buildPersonalAssistantSeeds } from "./personal-assistant-seeds";

/**
 * Post-create bookkeeping: persist the last-used pick and reload the stores.
 * Runs in the BACKGROUND — `loadWorkspaces()` reads providers through the
 * freshly-created (cold) agent pod, so awaiting it would stall the create click
 * ~20s (HOU-649). The `create` store action already made the new agent current
 * and listed, so the shell is correct without this; it only refreshes.
 */
async function refreshAfterCreate(
  ensured: EnsuredWorkspace<Workspace, Agent>,
  provider: string | undefined,
  model: string | undefined,
): Promise<void> {
  // Persist the account timezone so the seeded morning-briefing routine fires at
  // the user's local 7am, not the cloud pod's UTC 7am. The Routines-tab hook
  // auto-seeds this too, but it never mounts during onboarding — so a user who
  // never opens Routines would otherwise have their first routine fire in UTC.
  // Shared helper with the hook; if-absent guarded, never overwrites an existing
  // pref. A persist failure already surfaces via the tauri wrapper's toast.
  await seedTimezoneIfUnset().catch((err) =>
    logger.error(`[onboarding] timezone seed failed: ${err}`),
  );
  // Only persist a last-used pick when one was actually made. The connect-step
  // skip provisions the assistant with no provider (it waits for a connection),
  // so there is nothing honest to record as "last used".
  if (provider && model) await tauriProvider.setLastUsed(provider, model);
  if (ensured.createdWorkspace) {
    analytics.track("workspace_created", { provider, source: "onboarding" });
  }
  await useWorkspaceStore.getState().loadWorkspaces();
  useWorkspaceStore.getState().setCurrent(ensured.workspace);
  await useAgentStore.getState().loadAgents(ensured.workspace.id);
  const refreshed = useAgentStore
    .getState()
    .agents.find((a) => a.id === ensured.assistant.id);
  if (refreshed) useAgentStore.getState().setCurrent(refreshed);
}

interface UseCreateAssistantArgs {
  assistantName: string;
  assistantColor: string;
}

/**
 * Provisions the default workspace + personal assistant for first-run, and owns
 * the created agent (the email step needs it). Extracted from the orchestrator
 * to keep it under the file cap.
 *
 * `create` collapses concurrent / repeated calls onto ONE in-flight operation
 * so first-run can never fire `createWorkspace` twice — a double-clicked
 * Continue or a remount reuses the same promise (HOU-444).
 *
 * `create` takes the provider/model OPTIONALLY: the happy path passes the
 * just-connected pick, but the connect-step skip calls it with neither, so the
 * assistant is provisioned provider-less (the honest state — it exists and
 * waits until an AI is connected later from the AI Hub).
 */
export function useCreateAssistant({
  assistantName,
  assistantColor,
}: UseCreateAssistantArgs): {
  agent: Agent | null;
  creating: boolean;
  create: (provider?: string, model?: string) => Promise<Agent>;
} {
  const { t, i18n } = useTranslation("setup");
  const [agent, setAgent] = useState<Agent | null>(null);
  const [creating, setCreating] = useState(false);
  const creationRef = useRef<Promise<Agent> | null>(null);

  const createWorkspaceAndAssistant = (
    pickedProvider: string | undefined,
    pickedModel: string | undefined,
  ): Promise<Agent> => {
    if (creationRef.current) return creationRef.current;

    const op = surfaceAgentThenRefresh<EnsuredWorkspace<Workspace, Agent>>(
      // Create the workspace + assistant; resolves once the agent RECORD exists
      // (POST /agents), which is all the next (email) step needs.
      () => {
        const setup = defaultAssistantSetup({
          workspaceName: t("tutorial.defaults.workspaceName"),
          assistantName:
            assistantName.trim() || t("tutorial.defaults.assistantName"),
          focus: t("tutorial.defaults.focus"),
          approvalRule: t("tutorial.defaults.approvalRule"),
        });
        setup.color = assistantColor;
        return ensureWorkspaceWithAssistant(setup.workspaceName, {
          listWorkspaces: () => tauriWorkspaces.list(),
          createWorkspace: (name) => tauriWorkspaces.create(name),
          listAgents: (workspaceId) => tauriAgents.list(workspaceId),
          createAssistant: (workspaceId) =>
            createPersonalAssistantForWorkspace(workspaceId, {
              name: setup.assistantName.trim(),
              instructions: buildAssistantInstructions(setup),
              color: setup.color,
              provider: pickedProvider,
              model: pickedModel,
              // Real capability on day one: a Daily Briefing routine + a
              // Meeting-prep skill, seeded into the fresh agent's tree. The
              // active locale selects the language they write output in.
              seeds: buildPersonalAssistantSeeds(t, i18n.language),
            }),
        });
      },
      // Surface the agent the instant its record lands so onboarding advances to
      // the email step immediately; the refresh below must not gate this.
      (ensured) => setAgent(ensured.assistant),
      // Background: the pod-dependent refresh that used to stall the click.
      (ensured) => refreshAfterCreate(ensured, pickedProvider, pickedModel),
      (err) =>
        logger.error(`[onboarding] post-create store refresh failed: ${err}`),
    ).then((ensured) => ensured.assistant);

    creationRef.current = op;
    op.catch(() => {
      creationRef.current = null;
    });
    return op;
  };

  const create = async (provider?: string, model?: string): Promise<Agent> => {
    setCreating(true);
    try {
      return await createWorkspaceAndAssistant(provider, model);
    } finally {
      setCreating(false);
    }
  };

  return { agent, creating, create };
}
