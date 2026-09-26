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
import { isSpaceInvariantQueryKey } from "../lib/space-cache";
import { useAgentStore } from "../stores/agents";
import { useUIStore } from "../stores/ui";
import { useWorkspaceStore } from "../stores/workspaces";
import { sidebarLayoutRefetchDeferred } from "./sidebar-layout-writes";

/**
 * Maps agent-change events from Rust (both Tauri command emissions
 * and file watcher) to TanStack Query invalidations.
 *
 * One hook, mounted once in App. Covers ALL agent data types.
 */
export function useAgentInvalidation() {
  const qc = useQueryClient();
  const { t } = useTranslation("shell");

  useEffect(() => {
    // An event names its agent, which just emitted and so is awake by
    // definition: only its slice is re-read (`patchAgentSlice`), so a single
    // busy agent's event stream never keeps the whole fleet awake.
    const patchAllConversations = (agentPath: string) => {
      patchAgentSlice(qc, agentPath).catch((e) => {
        // Stale badge until the agent's next event — never a broken app.
        logger.warn(`[invalidation] conversations patch failed: ${e}`);
      });
    };
    const offEngineRestarted = onEngineRestarted(() => {
      qc.invalidateQueries({ queryKey: ["activity"] });
      qc.invalidateQueries({ queryKey: ["all-conversations"] });
      // The supervisor restarted the host sidecar after a crash. Beta policy:
      // never let that pass silently — the user should know a reconnect
      // happened (and that in-flight work may have been interrupted).
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

      // Pure decision (which caches this event touches) is derived in
      // `planInvalidation`; the hook only EXECUTES the plan against the real
      // QueryClient + stores. See `agent-invalidation-plan.ts` for the rules
      // (e.g. why ActivityChanged also invalidates the per-agent conversations
      // query the board's face stack is derived from).
      const roster = useAgentStore.getState().agents;
      const plan = planInvalidation(p, {
        workspaceId: useWorkspaceStore.getState().current?.id,
        // The aggregate is patched only for agents in THIS viewer's roster:
        // the hosted stream names every awake agent in the space, and a read
        // of one the viewer is not assigned to is a 403 every time.
        isKnownAgent: (agentPath) =>
          roster.some((a) => a.folderPath === agentPath),
        // Consumed (one-shot) ONLY for the event type it gates, so an
        // unrelated event can never burn a pending OAuth's return marker.
        customOAuthReturn:
          p.type === "CustomIntegrationsChanged"
            ? consumeCustomOAuthReturn()
            : false,
      });
      // The catch-up sweep: every cached query goes stale and TanStack
      // refetches the mounted ones. The transport gap that asks for this lost
      // an unknown set of events, so a key list would only be a guess (see the
      // plan's `invalidateAll`). Identity and the first-run flags are held out
      // — no server event is ever about them, and refetching them flaps the
      // auth / onboarding gates over a dropped stream.
      if (plan.invalidateAll) {
        qc.invalidateQueries({
          predicate: (q) =>
            !isSpaceInvariantQueryKey(q.queryKey) &&
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
        // Pull the app back to the front the moment the browser sign-in
        // finishes — the user just authorized in their browser, so surface the
        // app on the detected event. No-op outside Tauri.
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
