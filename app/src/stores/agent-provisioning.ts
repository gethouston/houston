/**
 * Global "this agent is still being created" state (HOU-693).
 *
 * Hosted profile only: creating an agent answers instantly while its engine
 * warms up for a couple of minutes with no readiness signal from the platform
 * (see `lib/agent-provisioning.ts`). `useAgentStore.create` marks the fresh
 * agent here; a readiness long-poll clears it the moment the agent's engine
 * answers anything. The banner (`AgentProvisioningBanner`) and the in-chat
 * card (`AgentProvisioningCard`) subscribe to the presence map.
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
  type ProvisioningEntry,
  parsePersistedProvisioning,
  runProvisioningProbe,
} from "../lib/agent-provisioning";
import { getEngine, isCoLocatedEngine, whenEngineReady } from "../lib/engine";
import { reportError, showErrorToast } from "../lib/error-toast";
import i18n from "../lib/i18n";
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
  /** Start tracking a just-created agent (no-op on a co-located engine). */
  markProvisioning: (agent: { id: string; folderPath: string }) => void;
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
   * Stop tracking. With `onlyIf`, clears only while that exact entry is still
   * current — a probe's own settle must not clear a newer re-mark of the id.
   */
  clearProvisioning: (agentId: string, onlyIf?: ProvisioningEntry) => void;
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

/** Non-reactive read for imperative flows (mission creation). */
export function isAgentProvisioning(agentId: string): boolean {
  return Boolean(useAgentProvisioningStore.getState().provisioning[agentId]);
}

export const useAgentProvisioningStore = create<AgentProvisioningState>(
  (set, get) => ({
    provisioning: {},

    markProvisioning: (agent) => {
      if (isCoLocatedEngine()) return;
      startEntry({
        agentId: agent.id,
        agentPath: agent.folderPath,
        since: Date.now(),
      });
    },

    carryRename: (oldId, agent) => {
      const previous = get().provisioning[oldId];
      if (!previous) return;
      get().clearProvisioning(oldId);
      // Keep the original TTL anchor: the rename didn't restart the warm-up.
      // Queued sends move with the agent (their session keys are stable).
      startEntry({
        agentId: agent.id,
        agentPath: agent.folderPath,
        since: previous.since,
        pendingSends: previous.pendingSends,
      });
    },

    queueWarmingSend: (agentId, args) => {
      const entry = get().provisioning[agentId];
      if (!entry || isFlushingWarmingSends(entry)) return false;
      // Mutate in place: replacing the entry object would retire its live
      // probe (the probe's exit switch is entry identity). Presence didn't
      // change, so no set() — only the mirror needs the new send.
      entry.pendingSends = [
        ...(entry.pendingSends ?? []),
        buildWarmingSend(args),
      ];
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
      // new composer send can), then drop the card/placeholder.
      void flushWarmingSends(entry).finally(() =>
        store.clearProvisioning(id, entry),
      );
    },
    onTimeout: (id, lastError) => {
      store.clearProvisioning(id, entry);
      showErrorToast(
        "agent_provisioning",
        lastError instanceof Error ? lastError.message : String(lastError),
        lastError,
        { userMessage: i18n.t("shell:agentProvisioning.failed") },
      );
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
    startEntry(entry);
    // The relaunch emptied the in-memory VM: re-render the queued bubbles so
    // the sent-but-not-yet-delivered messages stay visible.
    restoreWarmingBubbles(entry);
  }
});
