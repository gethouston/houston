import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { seedTimezoneIfUnset } from "../../hooks/use-timezone-preference";
import { analytics } from "../../lib/analytics";
import { logger } from "../../lib/logger";
import type { OnboardingSegmentChoice } from "../../lib/onboarding-segment";
import { tauriAgents, tauriProvider, tauriWorkspaces } from "../../lib/tauri";
import type { Agent, Workspace } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useWorkspaceStore } from "../../stores/workspaces";
import {
  assistantContentForSegment,
  seedExtraPackAgents,
} from "./assistant-segment-seeds";
import { createPersonalAssistantForWorkspace } from "./create-personal-assistant";
import {
  type EnsuredWorkspace,
  ensureWorkspaceWithAssistant,
} from "./ensure-default-assistant";
import { surfaceAgentThenRefresh } from "./first-run-provision";
import { defaultAssistantSetup } from "./personal-assistant-artifacts";
import { agentPacksForSegment } from "./segment-agent-pack";

/**
 * Post-create bookkeeping: persist the last-used pick and reload the stores.
 * Runs in the BACKGROUND — `loadWorkspaces()` reads providers through the
 * freshly-created (cold) agent pod, so awaiting it would stall the create click
 * ~20s (HOU-649). The `create` store action already made the new agent current
 * and listed, so the shell is correct without this; it only refreshes.
 */
async function refreshAfterCreate(
  ensured: EnsuredWorkspace<Workspace, Agent>,
  provider: string,
  model: string,
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
  await tauriProvider.setLastUsed(provider, model);
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
  /** The answered first-run segment, used to pick a role-specific store pack to
   *  seed the assistant with; `null` (unmapped / skipped) seeds the generic one. */
  segment: OnboardingSegmentChoice | null;
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
  segment,
}: UseCreateAssistantArgs): {
  agent: Agent | null;
  creating: boolean;
  create: (provider: string, model: string) => Promise<Agent>;
} {
  const { t, i18n } = useTranslation("setup");
  const [agent, setAgent] = useState<Agent | null>(null);
  const [creating, setCreating] = useState(false);
  const creationRef = useRef<Promise<Agent> | null>(null);

  const createWorkspaceAndAssistant = (
    pickedProvider: string,
    pickedModel: string,
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
          createAssistant: async (workspaceId) => {
            // Role-aware seeds: a segment that maps to a store pack seeds that
            // pack's CLAUDE.md + skills/routines; everything else keeps the
            // generic Daily Briefing + Meeting-prep. The active locale selects
            // the language / translated pack variant either way.
            const { instructions, seeds } = await assistantContentForSegment(
              setup,
              t,
              i18n.language,
              segment,
            );
            return createPersonalAssistantForWorkspace(workspaceId, {
              name: setup.assistantName.trim(),
              instructions,
              color: setup.color,
              provider: pickedProvider,
              model: pickedModel,
              seeds,
            });
          },
        });
      },
      // Surface the agent the instant its record lands so onboarding advances to
      // the email step immediately; the refresh below must not gate this.
      (ensured) => setAgent(ensured.assistant),
      // Background: seed the secondary role agents (packs beyond the primary),
      // then run the pod-dependent store refresh that used to stall the click.
      // Both stay off the surface path — the refresh reload picks the new agents
      // up and re-selects the primary assistant.
      async (ensured) => {
        await seedExtraPackAgents(
          ensured.workspace.id,
          agentPacksForSegment(segment).slice(1),
          i18n.language,
        );
        await refreshAfterCreate(ensured, pickedProvider, pickedModel);
      },
      (err) =>
        logger.error(`[onboarding] post-create store refresh failed: ${err}`),
    ).then((ensured) => ensured.assistant);

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
