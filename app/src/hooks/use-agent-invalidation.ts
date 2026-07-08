import type { HoustonEvent } from "@houston-ai/core";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { onEngineRestarted } from "../lib/engine";
import { subscribeHoustonEvents } from "../lib/events";
import { logger } from "../lib/logger";
import { osFocusWindow } from "../lib/os-bridge";
import { queryKeys } from "../lib/query-keys";
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

      switch (p.type) {
        case "ActivityChanged":
          qc.invalidateQueries({
            queryKey: queryKeys.activity(p.data.agent_path),
          });
          patchAllConversations(p.data.agent_path);
          break;
        case "SkillsChanged":
          qc.invalidateQueries({
            queryKey: queryKeys.skills(p.data.agent_path),
          });
          // The open skill's detail pane rides a separate key; refresh it too.
          qc.invalidateQueries({
            queryKey: ["skill-detail", p.data.agent_path],
          });
          break;
        case "FilesChanged":
          qc.invalidateQueries({
            queryKey: queryKeys.files(p.data.agent_path),
          });
          break;
        case "ConfigChanged":
          qc.invalidateQueries({
            queryKey: queryKeys.config(p.data.agent_path),
          });
          break;
        case "ContextChanged":
          qc.invalidateQueries({
            queryKey: queryKeys.instructions(p.data.agent_path),
          });
          qc.invalidateQueries({
            queryKey: queryKeys.workspaceContext(p.data.agent_path),
          });
          break;
        case "ConversationsChanged":
          qc.invalidateQueries({
            queryKey: queryKeys.conversations(p.data.agent_path),
          });
          patchAllConversations(p.data.agent_path);
          // A message landing in ANY of this agent's conversations (e.g. a
          // teammate's turn) must reach an open chat live. The event carries
          // no session key, so invalidate the agent's whole chat-history
          // prefix — correctness over precision.
          qc.invalidateQueries({
            queryKey: queryKeys.chatHistoryForAgent(p.data.agent_path),
          });
          break;
        case "RoutinesChanged":
          qc.invalidateQueries({
            queryKey: queryKeys.routines(p.data.agent_path),
          });
          break;
        case "RoutineRunsChanged":
          qc.invalidateQueries({
            queryKey: ["routine-runs", p.data.agent_path],
          });
          break;
        case "LearningsChanged":
          qc.invalidateQueries({
            queryKey: queryKeys.learnings(p.data.agent_path),
          });
          break;
        case "AgentsChanged": {
          const workspaceId = useWorkspaceStore.getState().current?.id;
          if (workspaceId && p.data.workspace_id === workspaceId) {
            void useAgentStore
              .getState()
              .loadAgents(workspaceId, { silent: true });
          }
          break;
        }
        case "SidebarLayoutChanged": {
          // Best-effort cross-surface/multi-tab sync. The acting user's own
          // change already applied via the optimistic mutation; this refetches
          // for everyone else viewing the same workspace.
          const workspaceId = useWorkspaceStore.getState().current?.id;
          if (workspaceId && p.data.workspace_id === workspaceId) {
            qc.invalidateQueries({
              queryKey: queryKeys.sidebarLayout(workspaceId),
            });
          }
          break;
        }
        // SessionStatus triggers activity invalidation (agent finished → status changed)
        case "SessionStatus":
          if (p.data.status === "completed" || p.data.status === "error") {
            qc.invalidateQueries({ queryKey: ["activity"] });
            patchAllConversations(p.data.agent_path);
            // Cloud has NO file watcher and no post-turn sync diff, so a running
            // agent that writes its own CLAUDE.md / skills / learnings / files
            // mid-turn never fires a *Changed event. A finished turn is the one
            // reliable signal that the agent may have edited these surfaces, so
            // refetch them for this agent — cheap, and it saves the user from
            // remounting the tab to see self-authored changes (HOU-644). On
            // desktop this is harmless redundancy with the FS watcher.
            {
              const agentPath = p.data.agent_path;
              qc.invalidateQueries({
                queryKey: queryKeys.instructions(agentPath),
              });
              qc.invalidateQueries({
                queryKey: queryKeys.workspaceContext(agentPath),
              });
              qc.invalidateQueries({ queryKey: queryKeys.files(agentPath) });
              qc.invalidateQueries({ queryKey: queryKeys.skills(agentPath) });
              qc.invalidateQueries({ queryKey: ["skill-detail", agentPath] });
              qc.invalidateQueries({
                queryKey: queryKeys.learnings(agentPath),
              });
              qc.invalidateQueries({ queryKey: queryKeys.config(agentPath) });
              qc.invalidateQueries({
                queryKey: queryKeys.routines(agentPath),
              });
            }
          }
          break;
        // A provider OAuth sign-in (or sign-out) finished — refresh the
        // cached provider statuses so the chat model picker reflects the new
        // connection without waiting for the next mount (issue #342).
        case "ProviderLoginComplete":
          qc.invalidateQueries({ queryKey: queryKeys.providerStatuses() });
          // Pull the app back to the front the moment the browser sign-in
          // finishes — the user just authorized in their browser, so surface
          // the app on the detected event. No-op outside Tauri.
          void osFocusWindow().catch((e) =>
            logger.warn(`[provider] focus window failed: ${e}`),
          );
          break;
      }
    });

    return () => {
      offEngineRestarted();
      unlisten();
    };
  }, [qc, t]);
}
