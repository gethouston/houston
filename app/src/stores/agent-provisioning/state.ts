import type { ActivityStatus } from "@houston/engine-adapter";
import type { StoreApi } from "zustand";
import type { ProvisioningEntry } from "../../lib/agent-provisioning/entry";
import type { QueueWarmingSendArgs } from "../../lib/warming-sends";

export interface AgentProvisioningState {
  provisioning: Record<string, ProvisioningEntry>;
  sendsVersion: number;
  markProvisioning: (agent: { id: string; folderPath: string }) => void;
  detectSleepingEngine: (agent: { id: string; folderPath: string }) => void;
  engineAnswered: (agentPath: string) => void;
  carryRename: (
    oldId: string,
    agent: { id: string; folderPath: string },
  ) => void;
  queueWarmingSend: (agentId: string, args: QueueWarmingSendArgs) => boolean;
  setQueuedRowStatus: (
    agentId: string,
    activityId: string,
    status: ActivityStatus,
  ) => boolean;
  clearProvisioning: (agentId: string, onlyIf?: ProvisioningEntry) => void;
  reset: () => void;
}

export type AgentProvisioningStore = StoreApi<AgentProvisioningState>;
