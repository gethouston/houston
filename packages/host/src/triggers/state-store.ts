import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { RoutineTriggerBinding } from "@houston/protocol";
import type { AgentId } from "../domain/types";

/**
 * The reconciler's record of a routine's Composio trigger instance (self-host).
 * `status` is the final trigger-status the UI shows (contract C9 #4), set by the
 * reconciler as it converges desired→actual — so the status route serves it
 * verbatim. `disabled` is internal (a user-disabled routine keeps its instance
 * for cheap re-enable / later delete) and never surfaced to the client.
 */
export type TriggerProvisionStatus =
  | "active"
  | "pending"
  | "disabled"
  | "paused_disconnected"
  | "paused_revoked"
  | "error";

export interface TriggerStateEntry {
  /** Composio instance id; "" when a create failed / was pruned before provisioning. */
  trigger_instance_id: string;
  connected_account_id?: string;
  /** Hash of the binding, so a config edit recreates the instance. */
  config_hash: string;
  status: TriggerProvisionStatus;
  detail?: string;
}

/** Provisioning state for one agent, keyed by routine id. */
export type TriggerState = Record<string, TriggerStateEntry>;

/**
 * A stable hash of a trigger binding: any change to toolkit / slug / config /
 * pinned account flips it, which the reconciler reads as "recreate the instance".
 * JSON with sorted keys so key order never spuriously changes the hash.
 */
export function triggerConfigHash(binding: RoutineTriggerBinding): string {
  const canonical = JSON.stringify({
    toolkit: binding.toolkit,
    trigger_slug: binding.trigger_slug,
    trigger_config: sortValue(binding.trigger_config),
    connected_account_id: binding.connected_account_id ?? null,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/** Recursively sort object keys so JSON.stringify is order-independent. */
function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortValue(v)]),
    );
  }
  return value;
}

export interface TriggerStateStore {
  /** The agent's provisioning state, or `{}` when none was written. */
  get(agentId: AgentId): Promise<TriggerState>;
  /** Replace the agent's whole state (the reconciler writes a converged map). */
  put(agentId: AgentId, state: TriggerState): Promise<void>;
}

/** In-memory store for tests. */
export class MemoryTriggerStateStore implements TriggerStateStore {
  private readonly byAgent = new Map<AgentId, TriggerState>();

  async get(agentId: AgentId): Promise<TriggerState> {
    return structuredClone(this.byAgent.get(agentId) ?? {});
  }

  async put(agentId: AgentId, state: TriggerState): Promise<void> {
    this.byAgent.set(agentId, structuredClone(state));
  }
}

/**
 * File-backed store for the desktop/self-host tree: the record lives inside the
 * agent's own runtime dir (`<Workspace>/<Agent>/.houston/runtime/trigger-state.json`),
 * so it survives restarts and is removed for free when the agent dir is deleted.
 * Atomic tmp+rename write; a missing/corrupt file reads as `{}` (never a crash),
 * matching FileIntegrationGrantStore.
 */
export class FileTriggerStateStore implements TriggerStateStore {
  constructor(private readonly workspacesRoot: string) {}

  /** `<root>/<Workspace>/<Agent>/.houston/runtime/trigger-state.json`, or null on a bad id. */
  private fileFor(agentId: AgentId): string | null {
    if (agentId.includes("..")) return null;
    const parts = agentId.split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    return join(
      this.workspacesRoot,
      parts[0],
      parts[1],
      ".houston",
      "runtime",
      "trigger-state.json",
    );
  }

  async get(agentId: AgentId): Promise<TriggerState> {
    const path = this.fileFor(agentId);
    if (!path || !existsSync(path)) return {};
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as TriggerState;
      }
    } catch {
      // Corrupt/partial file → treat as absent so the next pass re-materializes.
    }
    return {};
  }

  async put(agentId: AgentId, state: TriggerState): Promise<void> {
    const path = this.fileFor(agentId);
    if (!path) throw new Error(`trigger state: invalid agent id '${agentId}'`);
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(state, null, 2));
    renameSync(tmp, path); // atomic swap
  }
}
