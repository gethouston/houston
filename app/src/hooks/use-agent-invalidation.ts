import type { HoustonEvent } from "@houston-ai/core";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { planInvalidation } from "../lib/agent-invalidation-plan";
import { patchAgentSlice } from "../lib/all-conversations-patch";
import { consumeCustomOAuthReturn } from "../lib/custom-oauth-return";
import { onEngineRestarted } from "../lib/engine";
import { subscribeHoustonEvents } from "../lib/events";
import { logger } from "../lib/logger";
import { osFocusWindow } from "../lib/os-bridge";
import { heldOutOfCatchUpSweep } from "../lib/space-cache";
import { useAgentStore } from "../stores/agents";
import { useUIStore } from "../stores/ui";
import { useWorkspaceStore } from "../stores/workspaces";
import { notifyMorningBriefing } from "./heartbeat-notification";
import { sidebarLayoutRefetchDeferred } from "./sidebar-layout-writes";

export function useAgentInvalidation() {
  const qc = useQueryClient();
  const { t } = useTranslation("shell");

  useEffect(() => {
    const patchAllConversations = (agentPath: string) => {
      patchAgentSlice(qc, agentPath).catch((e) => {
        logger.warn(`[invalidation] conversations patch failed: ${e}`);
      });
    };
    const offEngineRestarted = onEngineRestarted(() => {
      qc.invalidateQueries({ queryKey: ["activity"] });
      qc.invalidateQueries({ queryKey: ["all-conversations"] });
      useUIStore.getState().addToast({
        title: t("engineGate.reconnected"),
        variant: "info",
      });
    });
    const unlisten = subscribeHoustonEvents((p: HoustonEvent) => {
      console.log(
        "[invalidation] event:",
        p.type,
        "data" in p
          ? (p as { data: { agent_path?: string } }).data?.agent_path
          : "",
      );

      if (p.type === "HeartbeatDelivered") notifyMorningBriefing();

      const roster = useAgentStore.getState().agents;
      const plan = planInvalidation(p, {
        workspaceId: useWorkspaceStore.getState().current?.id,
        isKnownAgent: (agentPath) =>
          roster.some((a) => a.folderPath === agentPath),
        customOAuthReturn:
          p.type === "CustomIntegrationsChanged"
            ? consumeCustomOAuthReturn()
            : false,
      });
      if (plan.invalidateAll) {
        qc.invalidateQueries({
          predicate: (q) =>
            !heldOutOfCatchUpSweep(q) &&
            !sidebarLayoutRefetchDeferred(qc, q.queryKey),
        });
      }
      for (const queryKey of plan.invalidate) {
        if (sidebarLayoutRefetchDeferred(qc, queryKey)) continue;
        qc.invalidateQueries({ queryKey });
      }
      for (const agentPath of plan.patchAllConversations) {
        patchAllConversations(agentPath);
      }
      if (plan.reloadAgentsWorkspace) {
        void useAgentStore
          .getState()
          .loadAgents(plan.reloadAgentsWorkspace, { silent: true });
      }
      if (plan.focusWindow) {
        void osFocusWindow().catch((e) =>
          logger.warn(`[provider] focus window failed: ${e}`),
        );
      }
    });

    return () => {
      offEngineRestarted();
      unlisten();
    };
  }, [qc, t]);
}
