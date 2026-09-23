import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMoveAgentToTeam } from "../../hooks/queries";
import { useCapabilities } from "../../hooks/use-capabilities";
import {
  type ProviderStatusScan,
  useProviderStatuses,
} from "../../hooks/use-provider-statuses";
import { useSidebarLayout } from "../../hooks/use-sidebar-layout";
import { isAgentNameConflictError } from "../../lib/agent-name-conflict";
import {
  type AgentRoleContext,
  buildAgentRoleJobDescription,
} from "../../lib/agent-role-context";
import { finishAgentSetup } from "../../lib/agent-setup";
import { startAgentSetupMission } from "../../lib/agent-setup-mission";
import {
  confirmedConnectedProviders,
  connectedProviderIds,
} from "../../lib/connected-providers";
import { logAndReportError } from "../../lib/error-report";
import { showExpectedStateToast } from "../../lib/error-toast";
import { type KickoffPin, kickoffPinFromScan } from "../../lib/kickoff-pin";
import { newAgentPlacement } from "../../lib/new-agent-placement";
import { openAgentBoard } from "../../lib/open-agent";
import { hasAgentTeams } from "../../lib/org-roles";
import { tauriProvider } from "../../lib/tauri";
import type { AgentDefinition } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";

export function useCreateBlankAgent({
  open,
  targetTeamId,
  selectedDef,
  existingPath,
  onError,
  onDone,
}: {
  open: boolean;
  targetTeamId: string | null;
  selectedDef: AgentDefinition | undefined;
  existingPath: string | null;
  onError: (message: string | null) => void;
  onDone: () => void;
}) {
  const { t } = useTranslation(["agents", "agentOnboarding"]);
  const [creating, setCreating] = useState(false);
  const [lastUsed, setLastUsed] = useState<{
    provider: string | null;
    model: string | null;
  } | null>(null);
  const createAgent = useAgentStore((s) => s.create);
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const { capabilities } = useCapabilities();
  const serverBacked = hasAgentTeams(capabilities);
  const sidebar = useSidebarLayout(currentWorkspace?.id);
  const moveToTeam = useMoveAgentToTeam();
  const providerScan = useProviderStatuses();

  useEffect(() => {
    if (!open) {
      setCreating(false);
      setLastUsed(null);
      return;
    }
    let cancelled = false;
    tauriProvider
      .getLastUsed()
      .then(({ provider, model }) => {
        if (!cancelled) setLastUsed({ provider, model });
      })
      // The dialog still opens: without a last-used pair the default falls
      // back to a connected provider. Nothing to tell the user, but a lookup
      // that started failing must still reach us.
      .catch((err: unknown) => logAndReportError("new_agent_last_used", err));
    return () => {
      cancelled = true;
    };
  }, [open]);

  /**
   * The pin for the new agent, decided only on a scan that can answer.
   *
   * The shared status query is cached for 30s and the AI hub's sign-out repaints
   * only its OWN rows, so the scan this dialog is holding can still name a
   * provider the user has just disconnected — which is how a new agent's first
   * mission ended up pinned to a signed-out Anthropic. An unconfirmable scan is
   * therefore re-probed here, and if the fresh one still cannot confirm a
   * connection, nothing is pinned at all: the agent's first turn then falls to
   * whatever IS connected, or surfaces the connect card.
   */
  const resolveKickoffPin = async (): Promise<KickoffPin> => {
    const decide = (scan: ProviderStatusScan): KickoffPin | null =>
      kickoffPinFromScan({
        connected: connectedProviderIds(confirmedConnectedProviders(scan)),
        lastUsedProvider: lastUsed?.provider,
        lastUsedModel: lastUsed?.model,
      });
    return decide(providerScan) ?? decide(await providerScan.refetch()) ?? {};
  };

  return {
    creating,
    createBlankAgent: async (
      name: string,
      color: string | undefined,
      roleContext: AgentRoleContext,
    ) => {
      const trimmed = name.trim();
      if (creating || !trimmed || !currentWorkspace) return;
      onError(null);
      setCreating(true);
      const kickoffPin = await resolveKickoffPin();
      let created: { id: string; name: string; color?: string };
      let agentPath: string;
      try {
        const { agent } = await createAgent(
          currentWorkspace.id,
          trimmed,
          "blank",
          color,
          buildAgentRoleJobDescription(roleContext),
          selectedDef?.path,
          selectedDef?.config.agentSeeds,
          existingPath ?? undefined,
        );
        created = agent;
        agentPath = agent.folderPath;
      } catch (err) {
        onError(
          isAgentNameConflictError(err)
            ? t("agents:toasts.nameConflict", { name: trimmed })
            : t("agentOnboarding:roleSetup.createFailed"),
        );
        setCreating(false);
        return;
      }
      const placement = newAgentPlacement(targetTeamId, serverBacked);
      if (placement.kind === "server") {
        try {
          await moveToTeam.mutateAsync({
            agentId: created.id,
            teamId: placement.teamId,
          });
        } catch (err) {
          // The agent exists and works; only its place is wrong. The user asked
          // for a team and will go looking for it there, so say where it landed
          // instead of leaving them to find an agent that seems to be missing.
          logAndReportError("new_agent_placement", err);
          showExpectedStateToast(
            t("agentOnboarding:roleSetup.placementFailedTitle"),
            t("agentOnboarding:roleSetup.placementFailedBody", {
              name: created.name,
            }),
          );
        }
      } else if (placement.kind === "local") {
        // The local move is OPTIMISTIC and returns nothing to await: the layout
        // write it fires rolls the sidebar back and surfaces its own failure
        // from inside `useSidebarLayout`, so there is nothing to catch here —
        // and wrapping it would only have caught the synchronous cache write.
        sidebar.moveItem(created.id, {
          groupId: placement.groupId,
          beforeItemId: null,
        });
      }
      openAgentBoard(created.id);
      void finishAgentSetup(agentPath, { ...kickoffPin, routine: null });
      const ui = useUIStore.getState();
      if (!(ui.inAppOnboardingActive && ui.inAppOnboardingFirstRun)) {
        void startAgentSetupMission(
          {
            id: created.id,
            name: created.name,
            color: created.color,
            folderPath: agentPath,
          },
          kickoffPin,
          "created",
          roleContext,
        );
      }
      onDone();
    },
  };
}
