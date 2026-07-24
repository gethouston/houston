import type { AgentId } from "../domain/types";
import type {
  ActionApprovalStore,
  ApprovalRecord,
} from "./action-approval-store";

/**
 * The action-approval policy over the store. Before an agent's
 * `integration_execute` runs, the sandbox proxy consults `isGranted`: the user
 * confirmed this action ("Do it") within the last GRANT_TTL_MS, so it — and any
 * follow-up call of the SAME action (a batch, or a chained draft→send) — runs
 * without re-asking. `grant` records the confirmation. Grants expire after
 * GRANT_TTL_MS and are pruned on every read/write path, so a stale confirmation
 * never silently authorizes a much-later call.
 *
 * `grant` is a read → mutate → write across awaits, so two concurrent grants
 * for one agent could interleave and lose a write. Mutations are therefore
 * serialized per agent through a promise-chain tail (`chains`), so an agent's
 * writes never race each other.
 */
export class LocalActionApprovals {
  /** A confirmed action stays granted 15 minutes — long enough to cover a batch
   *  or a chained draft→send double-ask, short enough that a forgotten
   *  confirmation never authorizes a much-later call. */
  static readonly GRANT_TTL_MS = 15 * 60_000;

  private readonly store: ActionApprovalStore;
  /** Per-agent serialization tail: each mutating op chains onto the previous so
   *  an agent's read→mutate→write sequences never interleave. */
  private readonly chains = new Map<AgentId, Promise<unknown>>();

  constructor(deps: { store: ActionApprovalStore }) {
    this.store = deps.store;
  }

  /** Run `fn` after any in-flight mutation for this agent, and become the new
   *  tail. Errors don't poison the chain (the next op still runs); the tail entry
   *  is pruned once it settles so the map can't grow without bound. */
  private serialize<T>(agentId: AgentId, fn: () => Promise<T>): Promise<T> {
    const prev = this.chains.get(agentId) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    const tail = run.then(
      () => {},
      () => {},
    );
    this.chains.set(agentId, tail);
    void tail.then(() => {
      if (this.chains.get(agentId) === tail) this.chains.delete(agentId);
    });
    return run;
  }

  /** Is a FRESH (within TTL) grant for this action recorded (case-insensitive)? */
  async isGranted(
    agentId: AgentId,
    action: string,
    now = Date.now(),
  ): Promise<boolean> {
    const record = await this.store.get(agentId);
    const a = action.toLowerCase();
    return record.grants.some(
      (g) => g.action.toLowerCase() === a && !this.isStale(g.ts, now),
    );
  }

  /** Grant this action for the TTL window: refresh an existing same-action grant's
   *  ts (case-insensitive) or add one, drop stale grants, and persist. */
  async grant(
    agentId: AgentId,
    action: string,
    now = Date.now(),
  ): Promise<void> {
    return this.serialize(agentId, async () => {
      const record = await this.store.get(agentId);
      const a = action.toLowerCase();
      const kept = record.grants.filter((g) => g.action.toLowerCase() !== a);
      kept.push({ action, ts: now });
      await this.store.put(agentId, this.pruned({ grants: kept }, now));
    });
  }

  private isStale(ts: number, now: number): boolean {
    return now - ts > LocalActionApprovals.GRANT_TTL_MS;
  }

  /** Drop expired grants so persisted state never accumulates dead confirmations. */
  private pruned(record: ApprovalRecord, now: number): ApprovalRecord {
    return { grants: record.grants.filter((g) => !this.isStale(g.ts, now)) };
  }
}
