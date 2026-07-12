import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useActivity, useAllConversations } from "../../hooks/queries";
import { analytics } from "../../lib/analytics";
import { createMission } from "../../lib/create-mission";
import { genericErrorDescription } from "../../lib/error-toast";
import {
  encodeIntegrationSetupMessage,
  findDraftIntegrationSetupActivity,
  INTEGRATION_SETUP_AGENT_MODE,
} from "../../lib/integration-chat-setup";
import { queryKeys } from "../../lib/query-keys";
import { tauriActivity, tauriConfig } from "../../lib/tauri";
import { readAgentTurnMode } from "../../lib/turn-mode";
import type { Agent } from "../../lib/types";
import { useAgentCatalogStore } from "../../stores/agent-catalog";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";

/**
 * Owns the custom-integration setup chat on the global Integrations page
 * (mirrors `useRoutineChatSetup`). Unlike routines there is no ambient agent —
 * the page is global — so the OWNING agent is derived two ways: the panel's
 * open flag (`integrationSetupChatAgentId`) while a chat is open, else the
 * cross-agent conversation scan that finds the one live draft and reads its
 * `agent_path`. That keeps the Continue-setup banner working after a reload,
 * when the ephemeral open flag is gone but the draft activity is still on disk.
 *
 * A setup chat is a normal mission tagged with the integration-setup sentinel
 * so it never shows as a board card (see `isSetupChatMode`). There is no
 * chat↔integration back-link to reconcile: the draft simply persists until the
 * user discards it (archives it) or starts a fresh one.
 */
export function useIntegrationChatSetup() {
  const { t } = useTranslation("integrations");
  const queryClient = useQueryClient();
  const addToast = useUIStore((s) => s.addToast);
  const openAgentId = useUIStore((s) => s.integrationSetupChatAgentId);
  const setOpenAgentId = useUIStore((s) => s.setIntegrationSetupChatAgentId);
  const agents = useAgentStore((s) => s.agents);
  const getAgentDef = useAgentCatalogStore((s) => s.getById);
  const [pending, setPending] = useState(false);

  const paths = useMemo(() => agents.map((a) => a.folderPath), [agents]);

  // Cross-agent scan: the one live draft anywhere, so the banner survives a
  // reload (the open flag is ephemeral, the draft on disk is not). This query
  // is fetched once and kept fresh by push-event cache patches — never
  // background-refetched — so reading it here wakes no pods.
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

  // The agent the chat belongs to right now: the open panel's agent, else the
  // draft's owner (the banner needs it to reopen).
  const openAgent = useMemo(
    () => (openAgentId ? agents.find((a) => a.id === openAgentId) : undefined),
    [openAgentId, agents],
  );
  const activeAgent = openAgent ?? draftAgent;
  const activeAgentDef = activeAgent
    ? (getAgentDef(activeAgent.configId) ?? null)
    : null;

  // The full Activity (session_key, pending_interaction) for the active agent's
  // draft — the cross-agent conversation row is too thin to render the chat.
  const { data: rawItems } = useActivity(activeAgent?.folderPath);
  const draftActivity = useMemo(
    () => findDraftIntegrationSetupActivity(rawItems) ?? null,
    [rawItems],
  );

  const open = openAgentId !== null && activeAgent !== null;

  const openPanel = useCallback(
    (agentId: string) => {
      // Every AIBoard portals its detail panel into the SAME shared container;
      // close whatever chat another surface left open so panels never stack.
      useUIStore.getState().onPanelClose?.();
      setOpenAgentId(agentId);
    },
    [setOpenAgentId],
  );

  const closePanel = useCallback(() => setOpenAgentId(null), [setOpenAgentId]);

  const toastStartError = useCallback(
    (err: unknown) => {
      // The mission never started (createMission rolled the activity back), so
      // a toast is the only surface for the failure.
      addToast({
        title: t("custom.setupChat.startError"),
        description: genericErrorDescription("custom_integration_chat", err),
        variant: "error",
      });
    },
    [addToast, t],
  );

  /** Start (or resume) the setup chat for the picked agent. */
  const start = useCallback(
    async (agent: Agent) => {
      // Resume this agent's existing draft instead of piling up a second one.
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
      if (pending) return false; // a start is already in flight — never double-create
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
            modeOverride: await readAgentTurnMode(
              agent.folderPath,
              tauriConfig.read,
            ),
            buildPrompt: () => encodeIntegrationSetupMessage(),
          },
        );
        // createMission bypasses useCreateActivity — refetch so the panel's
        // backing activity exists before it tries to render. The cross-agent
        // scan (banner) refreshes on its own via the push-event cache patch.
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

  /**
   * Archive the draft chat and close the panel. `done` and `discard` are the
   * SAME mechanics with different meaning: both retire the draft so the next
   * "Add custom integration" starts a FRESH chat (start() only resumes live
   * drafts); `done` is the user saying the integration works (success toast),
   * `discard` is abandoning the attempt (silent).
   */
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
  /** The user says the integration is set up and working: retire the chat. */
  const finish = useCallback(() => archiveDraft("done"), [archiveDraft]);

  return {
    activeAgent,
    activeAgentDef,
    draftActivity,
    /** A live draft exists somewhere (drives the Continue-setup banner). */
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
