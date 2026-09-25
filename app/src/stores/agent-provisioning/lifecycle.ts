/**
 * Entry lifecycle behind the agent-provisioning store: mark an entry, run its
 * readiness probe, and rehydrate the mirror after a relaunch. Each probe holds
 * its own entry object and quits when the store no longer carries that exact
 * entry.
 */

import type { ProvisioningEntry } from "../../lib/agent-provisioning/entry";
import { completeWarmupHandoff } from "../../lib/agent-provisioning/handoff";
import { parsePersistedProvisioning } from "../../lib/agent-provisioning/persist";
import { runProvisioningProbe } from "../../lib/agent-provisioning/probe";
import { getEngine, isCoLocatedEngine } from "../../lib/engine";
import { reportError } from "../../lib/error-report";
import { showErrorToast } from "../../lib/error-toast";
import i18n from "../../lib/i18n";
import { logger } from "../../lib/logger";
import { queryClient } from "../../lib/query-client";
import { healStaleRosterFromError } from "../../lib/roster-heal";
import {
  flushWarmingSends,
  restoreWarmingBubbles,
} from "../../lib/warming-sends";
import type { AgentProvisioningStore } from "./state";
import { storageRead, storageWrite } from "./storage";

export const sleep = (ms: number) =>
  new Promise<void>((r) => setTimeout(r, ms));

export function startEntry(
  store: AgentProvisioningStore,
  entry: ProvisioningEntry,
): void {
  store.setState((s) => {
    const provisioning = { ...s.provisioning, [entry.agentId]: entry };
    storageWrite(provisioning);
    return { provisioning };
  });
  startProbe(store, entry);
}

function startProbe(
  store: AgentProvisioningStore,
  entry: ProvisioningEntry,
): void {
  const actions = store.getState();
  void runProvisioningProbe(entry, {
    readFile: (agentPath, relPath) =>
      getEngine().readAgentFile(agentPath, relPath),
    // Identity, not presence: a re-mark of the same id retires this probe.
    isMarked: (id) => store.getState().provisioning[id] === entry,
    onReady: (id) => {
      // The flush-then-refetch-then-clear order, and why reads open before
      // the refetch, is `completeWarmupHandoff`. New sends already steer to
      // the normal wire path once the flush started.
      void completeWarmupHandoff(entry, {
        flush: flushWarmingSends,
        refetch: (queryKey) => queryClient.invalidateQueries({ queryKey }),
        clear: () => actions.clearProvisioning(id, entry),
      }).catch((e) =>
        reportError("agent_provisioning_handoff", "warm-up handoff failed", e),
      );
    },
    onGone: (id, err) => {
      // The server no longer knows this agent (deleted/unshared elsewhere
      // while the entry — possibly rehydrated from the localStorage mirror —
      // still tracked it, HOUSTON-APP-4ZF). Flushing would only fan the same
      // "agent not found" 404 into every queued write; the honest surface is
      // the roster without the agent. Silent by the agent-gone contract
      // (`lib/agent-gone.ts`): log, heal the roster so the ghost disappears,
      // drop the entry and its queue.
      logger.warn(
        `[agent-provisioning] agent gone during warm-up, dropping entry: ${id}`,
      );
      healStaleRosterFromError(err);
      actions.clearProvisioning(id, entry);
    },
    onTimeout: (id, error) => {
      // A newer mark (rename, or a fresh create reusing the id) already
      // retired this exact entry — nothing to do.
      if (store.getState().provisioning[id] !== entry) return;
      // Never make a visible mission disappear on its own: a cold start past
      // the TTL flags the entry once (toast + sticky UI state) and keeps
      // waiting. A pod that's merely slow to schedule still comes up.
      if (!entry.timedOut) {
        entry.timedOut = true;
        showErrorToast("agent_provisioning", error.message, error, {
          userMessage: i18n.t("shell:agentProvisioning.stillStarting"),
        });
      }
      entry.since = Date.now();
      store.setState((s) => {
        storageWrite(s.provisioning);
        return { sendsVersion: s.sendsVersion + 1 };
      });
      startProbe(store, entry);
    },
    sleep,
    now: () => Date.now(),
  });
}

/**
 * Pick the still-fresh mirrored entries back up after a relaunch and resume
 * their probes. Hosted profile only — on a co-located engine nothing is ever
 * marked, and stale hosted entries expire via the TTL inside
 * parsePersistedProvisioning.
 */
export function rehydrateProvisioning(store: AgentProvisioningStore): void {
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
    startEntry(store, entry);
    // The relaunch emptied the in-memory VM: re-render the queued bubbles so
    // the sent-but-not-yet-delivered messages stay visible.
    restoreWarmingBubbles(entry);
  }
}
