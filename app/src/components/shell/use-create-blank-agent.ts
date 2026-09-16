import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMoveAgentToTeam } from "../../hooks/queries";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useProviderStatuses } from "../../hooks/use-provider-statuses";
import { useSidebarLayout } from "../../hooks/use-sidebar-layout";
import { isAgentNameConflictError } from "../../lib/agent-name-conflict";
import {
  type AgentRoleContext,
  buildAgentRoleJobDescription,
} from "../../lib/agent-role-context";
import { finishAgentSetup } from "../../lib/agent-setup";
import { startAgentSetupMission } from "../../lib/agent-setup-mission";
import { pickDefaultProviderModel } from "../../lib/default-provider-model";
import { logAndReportError } from "../../lib/error-report";
import { showExpectedStateToast } from "../../lib/error-toast";
import { newAgentPlacement } from "../../lib/new-agent-placement";
import { openAgentBoard } from "../../lib/open-agent";
import { hasAgentTeams } from "../../lib/org-roles";
import { providerIsConnected } from "../../lib/provider-connection";
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
  const { statuses: providerStatuses } = useProviderStatuses();
  const connectedProviders = useMemo(
    () =>
      Object.values(providerStatuses)
        .filter((status) => providerIsConnected(status))
        .map((status) => status.provider),
    [providerStatuses],
  );

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

  return {
    creating,
    createBlankAgent: async (
      name: string,
      color: string | undefined,
      roleContext: AgentRoleContext,
    ) => {
      const trimmed = name.trim();
      if (creating || !trimmed || !currentWorkspace) return;
      const resolved = pickDefaultProviderModel({
        lastUsedProvider: lastUsed?.provider,
        lastUsedModel: lastUsed?.model,
        connectedProviders,
      });
      const kickoffPin = resolved.confirmed
        ? { provider: resolved.provider, model: resolved.model }
        : {};
      onError(null);
      setCreating(true);
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
