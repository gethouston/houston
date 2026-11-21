import type { ProvisioningEntry } from "../../lib/agent-provisioning/entry";
import { handOffOnce } from "../../lib/agent-provisioning/handoff";
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

export function handOff(
  store: AgentProvisioningStore,
  entry: ProvisioningEntry,
): void {
  const run = handOffOnce(entry, {
    flush: flushWarmingSends,
    refetch: (queryKey) => queryClient.invalidateQueries({ queryKey }),
    clear: () => store.getState().clearProvisioning(entry.agentId, entry),
  });
  void run?.catch((e) =>
    reportError("agent_provisioning_handoff", "warm-up handoff failed", e),
  );
}

function startProbe(
  store: AgentProvisioningStore,
  entry: ProvisioningEntry,
): void {
  const actions = store.getState();
  void runProvisioningProbe(entry, {
    readFile: (agentPath, relPath) =>
      getEngine().readAgentFile(agentPath, relPath),
    isMarked: (id) => store.getState().provisioning[id] === entry,
    onReady: () => handOff(store, entry),
    onGone: (id, err) => {
      logger.warn(
        `[agent-provisioning] agent gone during warm-up, dropping entry: ${id}`,
      );
      healStaleRosterFromError(err);
      actions.clearProvisioning(id, entry);
    },
    onTimeout: (id, error) => {
      if (store.getState().provisioning[id] !== entry) return;
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

export function rehydrateProvisioning(store: AgentProvisioningStore): void {
  if (isCoLocatedEngine()) return;
  const raw = storageRead();
  const fresh = parsePersistedProvisioning(raw, Date.now());
  if (fresh.length === 0) {
    if (raw !== null) storageWrite({});
    return;
  }
  for (const entry of fresh) {
    if (entry.timedOut) entry.since = Date.now();
    startEntry(store, entry);
    restoreWarmingBubbles(entry);
  }
}
