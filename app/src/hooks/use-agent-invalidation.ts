import type { HoustonEvent } from "@houston-ai/core";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { planInvalidation } from "../lib/agent-invalidation-plan";
import { onEngineRestarted } from "../lib/engine";
import { subscribeHoustonEvents } from "../lib/events";
import { logger } from "../lib/logger";
import { osFocusWindow } from "../lib/os-bridge";
import { tauriConversations } from "../lib/tauri";
import { useAgentStore } from "../stores/agents";
import { useUIStore } from "../stores/ui";
import { useWorkspaceStore } from "../stores/workspaces";

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
    // Refresh ONE agent's slice of every cached all-conversations list.
    // Deliberately not `invalidateQueries({ queryKey: ["all-conversations"] })`:
    // that refetch fans out one request to EVERY agent's pod, and in hosted
    // mode each of those requests resets the pod's idle-sleep clock — so a
    // single busy agent's event stream used to keep the whole fleet awake for
    // as long as the app was open. Events name their agent; only that agent's
    // pod is touched (it just emitted, so it is awake by definition), and the
    // sidebar badges / Mission Control read the patched cache unchanged.
    const patchAllConversations = (agentPath: string) => {
      void tauriConversations
        .list(agentPath)
        .then((rows) => {
          qc.setQueriesData<{ agent_path: string }[]>(
            { queryKey: ["all-conversations"] },
            (old) =>
              old && [
                ...old.filter((c) => c.agent_path !== agentPath),
                ...rows,
              ],
          );
        })
        .catch((e) => {
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
      const plan = planInvalidation(p, {
        workspaceId: useWorkspaceStore.getState().current?.id,
      });
      for (const queryKey of plan.invalidate) {
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
