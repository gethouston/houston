import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useActivity, useAllConversations } from "../../hooks/queries";
import { useConnectedProviders } from "../../hooks/use-connected-providers";
import { readAgentModelOverrides } from "../../lib/agent-model-overrides";
import { isAgentWarmingError } from "../../lib/agent-warming-guard";
import { analytics } from "../../lib/analytics";
import { connectedProviderIds } from "../../lib/connected-providers";
import { createMission } from "../../lib/create-mission";
import { genericErrorDescription } from "../../lib/error-report";
import {
  encodeIntegrationSetupMessage,
  findDraftIntegrationSetupActivity,
  INTEGRATION_SETUP_AGENT_MODE,
} from "../../lib/integration-chat-setup";
import { queryKeys } from "../../lib/query-keys";
import { tauriActivity, tauriConfig } from "../../lib/tauri";
import { DEFAULT_TURN_MODE } from "../../lib/turn-mode";
import type { Agent } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";

export function useIntegrationChatSetup() {
  const { t } = useTranslation("integrations");
  const queryClient = useQueryClient();
  const addToast = useUIStore((s) => s.addToast);
  const openAgentId = useUIStore((s) => s.integrationSetupChatAgentId);
  const setOpenAgentId = useUIStore((s) => s.setIntegrationSetupChatAgentId);
  const agents = useAgentStore((s) => s.agents);
  const [pending, setPending] = useState(false);
  const connectedProvidersRef = useRef<readonly string[] | null>(null);
  connectedProvidersRef.current = connectedProviderIds(useConnectedProviders());

  const paths = useMemo(() => agents.map((a) => a.folderPath), [agents]);

  const { data: convos } = useAllConversations(paths);
  const draftConvo = useMemo(
    () => findDraftIntegrationSetupActivity(convos),
    [convos],
  );
  const draftAgent = useMemo(
    () =>
      draftConvo
        ? (agents.find((a) => a.folderPath === draftConvo.agent_path) ?? null)
        : null,
    [draftConvo, agents],
  );

  const openAgent = useMemo(
    () => (openAgentId ? agents.find((a) => a.id === openAgentId) : undefined),
    [openAgentId, agents],
  );
  const activeAgent = openAgent ?? draftAgent;

  const { data: rawItems } = useActivity(activeAgent?.folderPath);
  const draftActivity = useMemo(
    () => findDraftIntegrationSetupActivity(rawItems) ?? null,
    [rawItems],
  );

  const open = openAgentId !== null && activeAgent !== null;

  const openPanel = useCallback(
    (agentId: string) => {
      useUIStore.getState().onPanelClose?.();
      setOpenAgentId(agentId);
    },
    [setOpenAgentId],
  );

  const closePanel = useCallback(() => setOpenAgentId(null), [setOpenAgentId]);

  const toastStartError = useCallback(
    (err: unknown) => {
      if (isAgentWarmingError(err)) return;
      addToast({
        title: t("custom.setupChat.startError"),
        description: genericErrorDescription("custom_integration_chat", err),
        variant: "error",
      });
    },
    [addToast, t],
  );

  const start = useCallback(
    async (agent: Agent) => {
      const existing = (convos ?? []).some(
        (c) =>
          c.agent_path === agent.folderPath &&
          c.agent === INTEGRATION_SETUP_AGENT_MODE &&
          c.status !== "archived",
      );
      if (existing) {
        openPanel(agent.id);
        return true;
      }
      if (pending) return false;
      setPending(true);
      try {
        await createMission(
          {
            id: agent.id,
            name: agent.name,
            color: agent.color,
            folderPath: agent.folderPath,
          },
          "",
          {
            title: t("custom.setupChat.missionTitle"),
            agentMode: INTEGRATION_SETUP_AGENT_MODE,
            modeOverride: DEFAULT_TURN_MODE,
            ...(await readAgentModelOverrides(
              agent.folderPath,
              tauriConfig.read,
              connectedProvidersRef.current,
            )),
            kickoffPrompt: () => encodeIntegrationSetupMessage(),
          },
        );
        queryClient.invalidateQueries({
          queryKey: queryKeys.activity(agent.folderPath),
        });
        analytics.track("custom_integration_started");
        openPanel(agent.id);
        return true;
      } catch (err) {
        toastStartError(err);
        return false;
      } finally {
        setPending(false);
      }
    },
    [convos, pending, openPanel, queryClient, t, toastStartError],
  );

  const archiveDraft = useCallback(
    (outcome: "done" | "discard") => {
      if (!draftActivity || !activeAgent) return;
      setOpenAgentId(null);
      tauriActivity
        .update(activeAgent.folderPath, draftActivity.id, {
          status: "archived",
        })
        .then(() => {
          if (outcome === "done") {
            addToast({
              title: t("custom.setupChat.doneToast"),
              variant: "success",
            });
          }
          return queryClient.invalidateQueries({
            queryKey: queryKeys.activity(activeAgent.folderPath),
          });
        })
        .catch((err) => {
          if (isAgentWarmingError(err)) return;
          addToast({
            title: t("custom.setupChat.startError"),
            description: genericErrorDescription(
              "custom_integration_chat",
              err,
            ),
            variant: "error",
          });
        });
    },
    [draftActivity, activeAgent, setOpenAgentId, queryClient, addToast, t],
  );

  const discard = useCallback(() => archiveDraft("discard"), [archiveDraft]);
  const finish = useCallback(() => archiveDraft("done"), [archiveDraft]);

  return {
    activeAgent,
    draftActivity,
    hasDraft: draftConvo != null,
    open,
    start,
    openPanel,
    closePanel,
    discard,
    finish,
    pending,
  };
}
