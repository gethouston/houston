import { create } from "zustand";
import { detectEngineAsleep } from "../lib/agent-provisioning/asleep";
import { getEngine, isCoLocatedEngine, whenEngineReady } from "../lib/engine";
import { buildWarmingSend, isFlushingWarmingSends } from "../lib/warming-sends";
import {
  handOff,
  rehydrateProvisioning,
  sleep,
  startEntry,
} from "./agent-provisioning/lifecycle";
import type { AgentProvisioningState } from "./agent-provisioning/state";
import { storageWrite } from "./agent-provisioning/storage";

const asleepChecks = new Set<string>();

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
          if (!asleep || get().provisioning[agent.id]) return;
          startEntry(useAgentProvisioningStore, {
            agentId: agent.id,
            agentPath: agent.folderPath,
            since: Date.now(),
            reason: "asleep",
          });
        })
        .finally(() => asleepChecks.delete(agent.id));
    },

    engineAnswered: (agentPath) => {
      const entry = Object.values(get().provisioning).find(
        (e) => e.agentPath === agentPath,
      );
      if (entry) handOff(useAgentProvisioningStore, entry);
    },

    carryRename: (oldId, agent) => {
      const previous = get().provisioning[oldId];
      if (!previous) return;
      get().clearProvisioning(oldId);
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

void whenEngineReady().then(() =>
  rehydrateProvisioning(useAgentProvisioningStore),
);
