import { loadRoutines } from "@houston/domain";
import type { Routine, RoutineTriggerBinding } from "@houston/protocol";
import type { AgentId } from "../domain/types";
import type { LocalIntegrationGrants } from "../integrations/grants";
import type { IntegrationProvider } from "../integrations/provider";
import type { TriggerUpsertBinding } from "../integrations/types";
import { NoConnectedAccountError } from "../integrations/types";
import type { Vfs } from "../vfs";
import type { TriggerStateStore } from "./state-store";
import {
  type TriggerState,
  type TriggerStateEntry,
  triggerConfigHash,
} from "./state-store";

/**
 * Inputs to reconcile ONE agent's trigger instances. The provider is the DIRECT
 * Composio adapter (the reconciler only runs where the key lives — never the
 * remote/gateway adapter, whose trigger verbs throw). `userId` is the identity
 * the trigger instance binds to (self-host: the single local owner, whose
 * connections back the routine's toolkit).
 */
export interface ConvergeDeps {
  vfs: Vfs;
  provider: IntegrationProvider;
  state: TriggerStateStore;
  grants?: LocalIntegrationGrants;
  userId: string;
}

const toUpsertBinding = (t: RoutineTriggerBinding): TriggerUpsertBinding => ({
  toolkit: t.toolkit,
  triggerSlug: t.trigger_slug,
  triggerConfig: t.trigger_config,
  connectedAccountId: t.connected_account_id,
});

/** A toolkit is allowed when no grant record filters this agent, or it is listed. */
function isToolkitGranted(granted: string[] | null, toolkit: string): boolean {
  if (granted === null) return true;
  const t = toolkit.toLowerCase();
  return granted.some((g) => g.toLowerCase() === t);
}

/**
 * Converge one trigger routine to its Composio instance. Returns the state entry
 * to persist. Throws only on a Composio call failure — the caller maps it to an
 * `error` / `paused_disconnected` entry (never crashes the loop).
 */
async function convergeTriggerRoutine(
  deps: ConvergeDeps,
  agentId: AgentId,
  routine: Routine,
  binding: RoutineTriggerBinding,
  prev: TriggerStateEntry | undefined,
): Promise<TriggerStateEntry> {
  const config_hash = triggerConfigHash(binding);

  // User-disabled: stop delivery but keep the instance (cheap re-enable, and the
  // id is still needed to DELETE later if the routine is removed while disabled).
  if (!routine.enabled) {
    if (prev?.trigger_instance_id) {
      await deps.provider.setTriggerInstanceStatus(
        prev.trigger_instance_id,
        "disable",
      );
    }
    return {
      trigger_instance_id: prev?.trigger_instance_id ?? "",
      connected_account_id: prev?.connected_account_id,
      config_hash,
      status: "disabled",
    };
  }

  // Toolkit revoked / not granted to this agent (C4 eager revocation): delete the
  // instance and surface paused_revoked so the routine editor shows the fix.
  const granted = deps.grants ? await deps.grants.grantedOrNull(agentId) : null;
  if (!isToolkitGranted(granted, binding.toolkit)) {
    if (prev?.trigger_instance_id) {
      await deps.provider.deleteTriggerInstance(prev.trigger_instance_id);
    }
    return {
      trigger_instance_id: "",
      config_hash,
      status: "paused_revoked",
      detail: `${binding.toolkit} is not granted to this agent`,
    };
  }

  // Already provisioned, unchanged, healthy → idempotent no-op.
  if (
    prev?.trigger_instance_id &&
    prev.config_hash === config_hash &&
    prev.status === "active"
  ) {
    return prev;
  }

  // First provision or config change → create-or-recreate (upsert is idempotent).
  const ref = await deps.provider.upsertTriggerInstance(
    deps.userId,
    toUpsertBinding(binding),
  );
  return {
    trigger_instance_id: ref.triggerInstanceId,
    connected_account_id: binding.connected_account_id,
    config_hash,
    status: "active",
  };
}

/**
 * Reconcile every trigger routine of one agent against its Composio instances:
 * create/recreate/disable/delete to converge desired→actual, then persist the
 * new state (only when it changed, to avoid churn). Per-routine Composio failures
 * are captured as `error` / `paused_disconnected` entries — the loop never throws
 * for a provider fault, so one bad routine can't stall the others.
 */
export async function reconcileAgentTriggers(
  deps: ConvergeDeps,
  agentId: AgentId,
  root: string,
): Promise<void> {
  const { items: routines } = await loadRoutines(deps.vfs, root);
  const state = await deps.state.get(agentId);
  const next: TriggerState = {};
  const visited = new Set<string>();

  for (const routine of routines) {
    if (!routine.trigger) continue;
    visited.add(routine.id);
    const prev = state[routine.id];
    try {
      next[routine.id] = await convergeTriggerRoutine(
        deps,
        agentId,
        routine,
        routine.trigger,
        prev,
      );
    } catch (err) {
      const config_hash = triggerConfigHash(routine.trigger);
      const carriedId = prev?.trigger_instance_id ?? "";
      next[routine.id] =
        err instanceof NoConnectedAccountError
          ? {
              trigger_instance_id: carriedId,
              config_hash,
              status: "paused_disconnected",
              detail: err.message,
            }
          : {
              trigger_instance_id: carriedId,
              config_hash,
              status: "error",
              detail: err instanceof Error ? err.message : String(err),
            };
    }
  }

  // Orphans: a routine that lost its trigger (switched to cron) or was deleted —
  // delete its instance. A delete failure is kept as an `error` entry so the next
  // pass retries rather than leaking the instance silently.
  for (const [routineId, entry] of Object.entries(state)) {
    if (visited.has(routineId)) continue;
    if (!entry.trigger_instance_id) continue;
    try {
      await deps.provider.deleteTriggerInstance(entry.trigger_instance_id);
    } catch (err) {
      next[routineId] = {
        ...entry,
        status: "error",
        detail: `delete failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  if (JSON.stringify(next) !== JSON.stringify(state)) {
    await deps.state.put(agentId, next);
  }
}
