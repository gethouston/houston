/**
 * Global "this agent is still being created" state (HOU-693).
 *
 * Hosted profile only: creating an agent answers instantly while its engine
 * warms up for a couple of minutes with no readiness signal from the platform
 * (see `lib/agent-provisioning.ts`). `useAgentStore.create` marks the fresh
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
import {
  detectEngineAsleep,
  type ProvisioningEntry,
  parsePersistedProvisioning,
  runProvisioningProbe,
} from "../lib/agent-provisioning";
import { getEngine, isCoLocatedEngine, whenEngineReady } from "../lib/engine";
import { reportError, showErrorToast } from "../lib/error-toast";
import i18n from "../lib/i18n";
import { queryClient } from "../lib/query-client";
import { queryKeys } from "../lib/query-keys";
import {
  buildWarmingSend,
  flushWarmingSends,
  isFlushingWarmingSends,
  type QueueWarmingSendArgs,
  restoreWarmingBubbles,
} from "../lib/warming-sends";

const STORAGE_KEY = "houston.agent-provisioning";

interface AgentProvisioningState {
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
    status: string,
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

/** localStorage access, surfaced to Sentry (no toast — nothing user-blocking
 *  fails here, but a broken mirror must not stay invisible in beta). */
function storageRead(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    reportError("agent_provisioning_storage", "reading the mirror failed", e);
    return null;
  }
}
function storageWrite(state: Record<string, ProvisioningEntry>): void {
  try {
    const entries = Object.values(state);
    if (entries.length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (e) {
    reportError("agent_provisioning_storage", "writing the mirror failed", e);
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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
      startEntry({
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
          startEntry({
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
      startEntry({
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

function startEntry(entry: ProvisioningEntry): void {
  useAgentProvisioningStore.setState((s) => {
    const provisioning = { ...s.provisioning, [entry.agentId]: entry };
    storageWrite(provisioning);
    return { provisioning };
  });
  startProbe(entry);
}

function startProbe(entry: ProvisioningEntry): void {
  const store = useAgentProvisioningStore.getState();
  void runProvisioningProbe(entry, {
    readFile: (agentPath, relPath) =>
      getEngine().readAgentFile(agentPath, relPath),
    // Identity, not presence: a re-mark of the same id retires this probe.
    isMarked: (id) =>
      useAgentProvisioningStore.getState().provisioning[id] === entry,
    onReady: (id) => {
      // Deliver the queued messages FIRST (their turns register before any
      // new composer send can). Then refetch the board BEFORE dropping the
      // entry, so the optimistic rows hand off to the real rows the flush
      // wrote without a one-frame gap (HOU-713) — new sends already steer to
      // the normal wire path once the flush has started.
      void flushWarmingSends(entry)
        .then(() =>
          queryClient.invalidateQueries({
            queryKey: queryKeys.activity(entry.agentPath),
          }),
        )
        .finally(() => store.clearProvisioning(id, entry));
    },
    onTimeout: (id, lastError) => {
      // A newer mark (rename, or a fresh create reusing the id) already
      // retired this exact entry — nothing to do.
      if (useAgentProvisioningStore.getState().provisioning[id] !== entry) {
        return;
      }
      // HOU-693 regression: this used to clearProvisioning here, silently
      // dropping the user's still-visible first chat the moment a cold start
      // ran past the TTL. Never make a visible mission disappear on its own —
      // flag it once (toast + sticky UI state) and keep waiting instead of
      // giving up. A pod that's merely slow to schedule still comes up.
      if (!entry.timedOut) {
        entry.timedOut = true;
        showErrorToast(
          "agent_provisioning",
          lastError instanceof Error ? lastError.message : String(lastError),
          lastError,
          { userMessage: i18n.t("shell:agentProvisioning.stillStarting") },
        );
      }
      entry.since = Date.now();
      useAgentProvisioningStore.setState((s) => {
        storageWrite(s.provisioning);
        return { sendsVersion: s.sendsVersion + 1 };
      });
      startProbe(entry);
    },
    sleep,
    now: () => Date.now(),
  });
}

// Rehydrate after a relaunch: pick the still-fresh entries back up and resume
// their probes once the engine client exists. Hosted profile only — on a
// co-located engine nothing is ever marked, and stale hosted entries expire
// via the TTL inside parsePersistedProvisioning.
void whenEngineReady().then(() => {
  if (isCoLocatedEngine()) return;
  const raw = storageRead();
  const fresh = parsePersistedProvisioning(raw, Date.now());
  if (fresh.length === 0) {
    if (raw !== null) storageWrite({});
    return;
  }
  for (const entry of fresh) {
    // A timed-out entry's `since` may be hours stale (kept regardless of age
    // by the parse filter above) — re-anchor it so the resumed probe gets a
    // fresh TTL window instead of immediately re-timing-out.
    if (entry.timedOut) entry.since = Date.now();
    startEntry(entry);
    // The relaunch emptied the in-memory VM: re-render the queued bubbles so
    // the sent-but-not-yet-delivered messages stay visible.
    restoreWarmingBubbles(entry);
  }
});
