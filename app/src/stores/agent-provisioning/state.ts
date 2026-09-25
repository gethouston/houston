import type { ActivityStatus } from "@houston/engine-adapter";
import type { StoreApi } from "zustand";
import type { ProvisioningEntry } from "../../lib/agent-provisioning/entry";
import type { QueueWarmingSendArgs } from "../../lib/warming-sends";

export interface AgentProvisioningState {
  /** agentId → its provisioning entry, present while the engine warms up. */
  provisioning: Record<string, ProvisioningEntry>;
  /**
   * Bumped on every queued send. Entries mutate in place (their identity is a
   * live probe's exit switch), which alone never notifies subscribers — this
   * counter is the change signal the optimistic board rows re-render on.
   */
  sendsVersion: number;
  /** Start tracking a just-created agent (no-op on a co-located engine). */
  markProvisioning: (agent: { id: string; folderPath: string }) => void;
  /**
   * Asleep-check an EXISTING agent on open (HOU-730, hosted only): a pod
   * scaled to zero answers nothing until the gateway wakes it, so mark it
   * exactly like a just-created agent — sends park with a local bubble and
   * an optimistic mission row, and flush when the readiness probe clears.
   */
  detectSleepingEngine: (agent: { id: string; folderPath: string }) => void;
  /** A rename mid-warm-up moves the agent's id/path; re-key the entry. */
  carryRename: (
    oldId: string,
    agent: { id: string; folderPath: string },
  ) => void;
  /**
   * Park a chat send until the engine is ready (see `lib/warming-sends.ts`):
   * renders the bubble and appends to the entry's queue. Returns false — and
   * renders nothing — when the agent isn't marked (or its flush already
   * started): the caller sends normally.
   */
  queueWarmingSend: (agentId: string, args: QueueWarmingSendArgs) => boolean;
  /**
   * Flip the status a queued row will land with (the welcome mission
   * settling to needs_you once its greeting reveals, HOU-713). False when
   * the agent isn't marked, the flush already started, or no queued send
   * carries that row — the caller patches the real row instead.
   */
  setQueuedRowStatus: (
    agentId: string,
    activityId: string,
    status: ActivityStatus,
  ) => boolean;
  /**
   * Stop tracking. With `onlyIf`, clears only while that exact entry is still
   * current — a probe's own settle must not clear a newer re-mark of the id.
   */
  clearProvisioning: (agentId: string, onlyIf?: ProvisioningEntry) => void;
  /**
   * Drop every provisioning entry (and its localStorage mirror) on an identity
   * change (HOU-903): the marks are keyed by the outgoing account's agent ids
   * and probe its engine. Live probes self-retire (their exit switch is entry
   * identity, now absent from the store).
   */
  reset: () => void;
}

/** The store handle the lifecycle helpers drive (the Zustand hook itself). */
export type AgentProvisioningStore = StoreApi<AgentProvisioningState>;
