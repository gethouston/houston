/**
 * Global "this agent is still being created" state (HOU-693).
 *
 * Hosted profile only: creating an agent answers instantly while its engine
 * warms up for a couple of minutes with no readiness signal from the platform
 * (see `lib/agent-provisioning/`). `useAgentStore.create` marks the fresh
 * agent here; a readiness long-poll clears it the moment the agent's engine
 * answers anything. The board's optimistic mission rows
 * (`hooks/use-warming-board-rows.ts`) and the warming-write guard subscribe
 * to the presence map.
 *
 * The Zustand `provisioning` record is the single source of truth; the
 * localStorage mirror (so a relaunch mid-warm-up doesn't drop the state,
 * TTL-bounded) is re-derived from it on every change. Each probe holds its
 * own entry object and quits when the store no longer carries that exact
 * entry — re-marking or clearing an id retires the old probe without any
 * bookkeeping beside the record itself.
 */

import { create } from "zustand";
import { detectEngineAsleep } from "../lib/agent-provisioning/asleep";
import { getEngine, isCoLocatedEngine, whenEngineReady } from "../lib/engine";
import { buildWarmingSend, isFlushingWarmingSends } from "../lib/warming-sends";
import {
  rehydrateProvisioning,
  sleep,
  startEntry,
} from "./agent-provisioning/lifecycle";
import type { AgentProvisioningState } from "./agent-provisioning/state";
import { storageWrite } from "./agent-provisioning/storage";

/** Agent ids with an asleep-check in flight — one at a time per agent. */
const asleepChecks = new Set<string>();

/** Non-reactive read for imperative flows (mission creation). */
export function isAgentProvisioning(agentId: string): boolean {
  return Boolean(useAgentProvisioningStore.getState().provisioning[agentId]);
}

export const useAgentProvisioningStore = create<AgentProvisioningState>(
  (set, get) => ({
    provisioning: {},
    sendsVersion: 0,

    markProvisioning: (agent) => {
      if (isCoLocatedEngine()) return;
      startEntry(useAgentProvisioningStore, {
        agentId: agent.id,
        agentPath: agent.folderPath,
        since: Date.now(),
        reason: "create",
      });
    },

    detectSleepingEngine: (agent) => {
      if (isCoLocatedEngine()) return;
      if (get().provisioning[agent.id] || asleepChecks.has(agent.id)) return;
      asleepChecks.add(agent.id);
      void detectEngineAsleep(agent.folderPath, {
        readFile: (agentPath, relPath) =>
          getEngine().readAgentFile(agentPath, relPath),
        sleep,
      })
        .then((asleep) => {
          // Re-check: a create/rename may have marked the id while we probed.
          if (!asleep || get().provisioning[agent.id]) return;
          // "asleep", never "create": an existing agent's reads must keep
          // riding the gateway hold so its locally cached lists/transcripts
          // stay painted (see warmingReadsAnswerEmpty); sends still park and
          // writes still block, exactly like a just-created agent.
          startEntry(useAgentProvisioningStore, {
            agentId: agent.id,
            agentPath: agent.folderPath,
            since: Date.now(),
            reason: "asleep",
          });
        })
        .finally(() => asleepChecks.delete(agent.id));
    },

    carryRename: (oldId, agent) => {
      const previous = get().provisioning[oldId];
      if (!previous) return;
      get().clearProvisioning(oldId);
      // Keep the original TTL anchor and timed-out flag: the rename didn't
      // restart the warm-up, and carrying `timedOut` avoids re-showing the
      // "still starting" toast for a stall the user already saw.
      // Queued sends move with the agent (their session keys are stable).
      startEntry(useAgentProvisioningStore, {
        agentId: agent.id,
        agentPath: agent.folderPath,
        since: previous.since,
        pendingSends: previous.pendingSends,
        timedOut: previous.timedOut,
        reason: previous.reason,
      });
    },

    queueWarmingSend: (agentId, args) => {
      const entry = get().provisioning[agentId];
      if (!entry || isFlushingWarmingSends(entry)) return false;
      // Mutate in place: replacing the entry object would retire its live
      // probe (the probe's exit switch is entry identity). The version bump
      // is what notifies subscribers (the board's optimistic rows).
      entry.pendingSends = [
        ...(entry.pendingSends ?? []),
        buildWarmingSend(args),
      ];
      set((s) => ({ sendsVersion: s.sendsVersion + 1 }));
      storageWrite(get().provisioning);
      return true;
    },

    setQueuedRowStatus: (agentId, activityId, status) => {
      const entry = get().provisioning[agentId];
      if (!entry || isFlushingWarmingSends(entry)) return false;
      if (!entry.pendingSends?.some((s) => s.row?.id === activityId)) {
        return false;
      }
      // Same in-place posture as queueWarmingSend: keep the entry object (a
      // live probe's exit switch) but swap the array so selectors see it.
      entry.pendingSends = entry.pendingSends.map((s) =>
        s.row?.id === activityId ? { ...s, row: { ...s.row, status } } : s,
      );
      set((s) => ({ sendsVersion: s.sendsVersion + 1 }));
      storageWrite(get().provisioning);
      return true;
    },

    clearProvisioning: (agentId, onlyIf) => {
      const current = get().provisioning[agentId];
      if (!current || (onlyIf && current !== onlyIf)) return;
      set((s) => {
        const { [agentId]: _, ...rest } = s.provisioning;
        storageWrite(rest);
        return { provisioning: rest };
      });
    },

    reset: () => {
      asleepChecks.clear();
      storageWrite({});
      set({ provisioning: {}, sendsVersion: 0 });
    },
  }),
);

// Rehydrate after a relaunch once the engine adapter exists.
void whenEngineReady().then(() =>
  rehydrateProvisioning(useAgentProvisioningStore),
);
