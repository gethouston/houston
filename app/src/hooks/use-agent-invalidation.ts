import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { HoustonEvent } from "@houston-ai/core";
import { queryKeys } from "../lib/query-keys";
import { subscribeHoustonEvents } from "../lib/events";
import { onEngineRestarted } from "../lib/engine";
import { useSessionStatusStore } from "../stores/session-status";

/**
 * Maps agent-change events from Rust (both Tauri command emissions
 * and file watcher) to TanStack Query invalidations.
 *
 * One hook, mounted once in App. Covers ALL agent data types.
 */
export function useAgentInvalidation() {
  const qc = useQueryClient();

  useEffect(() => {
    const offEngineRestarted = onEngineRestarted(() => {
      useSessionStatusStore.getState().clearAll();
      qc.invalidateQueries({ queryKey: ["activity"] });
      qc.invalidateQueries({ queryKey: ["all-conversations"] });
    });
    const unlisten = subscribeHoustonEvents((p: HoustonEvent) => {
      console.log("[invalidation] event:", p.type, "data" in p ? (p as { data: { agent_path?: string } }).data?.agent_path : "");

      switch (p.type) {
        case "ActivityChanged":
          qc.invalidateQueries({ queryKey: queryKeys.activity(p.data.agent_path) });
          qc.invalidateQueries({ queryKey: ["all-conversations"] });
          break;
        case "SkillsChanged":
          qc.invalidateQueries({ queryKey: queryKeys.skills(p.data.agent_path) });
          break;
        case "FilesChanged":
          qc.invalidateQueries({ queryKey: queryKeys.files(p.data.agent_path) });
          break;
        case "ConfigChanged":
          qc.invalidateQueries({ queryKey: queryKeys.config(p.data.agent_path) });
          break;
        case "ContextChanged":
          qc.invalidateQueries({ queryKey: queryKeys.instructions(p.data.agent_path) });
          break;
        case "ConversationsChanged":
          qc.invalidateQueries({ queryKey: queryKeys.conversations(p.data.agent_path) });
          qc.invalidateQueries({ queryKey: ["all-conversations"] });
          break;
        case "RoutinesChanged":
          qc.invalidateQueries({ queryKey: queryKeys.routines(p.data.agent_path) });
          break;
        case "RoutineRunsChanged":
          qc.invalidateQueries({ queryKey: ["routine-runs", p.data.agent_path] });
          break;
        case "WorkflowsChanged":
          qc.invalidateQueries({ queryKey: queryKeys.workflows(p.data.agent_path) });
          break;
        case "WorkflowRunsChanged":
        case "WorkflowPlanProposed":
        case "WorkflowStepChanged":
          qc.invalidateQueries({ queryKey: ["workflow-runs", p.data.agent_path] });
          break;
        case "LearningsChanged":
          qc.invalidateQueries({ queryKey: queryKeys.learnings(p.data.agent_path) });
          break;
        // SessionStatus triggers activity invalidation (agent finished → status changed)
        case "SessionStatus":
          if (p.data.status === "completed" || p.data.status === "error") {
            qc.invalidateQueries({ queryKey: ["activity"] });
            qc.invalidateQueries({ queryKey: ["all-conversations"] });
          }
          break;
        // Composio CLI became available — refresh integrations state.
        case "ComposioCliReady":
          qc.invalidateQueries({ queryKey: queryKeys.connections() });
          qc.invalidateQueries({ queryKey: queryKeys.composioApps() });
          qc.invalidateQueries({ queryKey: queryKeys.connectedToolkits() });
          break;
        // Engine-side watcher saw a toolkit land in the consumer
        // connections list — flip every visible Composio card.
        case "ComposioConnectionAdded":
          qc.invalidateQueries({ queryKey: queryKeys.connectedToolkits() });
          break;
        // A provider OAuth sign-in (or sign-out) finished — refresh the
        // cached provider statuses so the chat model picker reflects the new
        // connection without waiting for the next mount (issue #342).
        case "ProviderLoginComplete":
          qc.invalidateQueries({ queryKey: queryKeys.providerStatuses() });
          break;
      }
    });

    return () => {
      offEngineRestarted();
      unlisten();
    };
  }, [qc]);
}
