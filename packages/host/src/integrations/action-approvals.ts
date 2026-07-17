import type { AgentId } from "../domain/types";
import type {
  ActionApprovalStore,
  ApprovalRecord,
} from "./action-approval-store";

/**
 * The action-approval policy over the store. Before an agent's
 * `integration_execute` runs, the sandbox proxy consults this:
 *   - `isAlways` → the user blessed this action for any params ("Always allow").
 *   - `consumeTicket` → a fresh one-shot ticket matches this exact call ("Allow
 *     once"); consumed on use so a re-issue of the same call re-asks.
 * Tickets expire after TICKET_TTL_MS and are pruned on every read/write path, so
 * a stale ticket never silently authorizes a later identical call.
 *
 * Every MUTATING op (allowAlways / addTicket / consumeTicket) is a read → mutate
 * → write across awaits, so two concurrent calls for one agent could interleave
 * and resurrect a consumed ticket or double-consume. They are therefore
 * serialized per agent through a promise-chain tail (mirroring the inflight-map
 * idiom in grants.ts), so an agent's writes never race each other.
 */
export class LocalActionApprovals {
  /** One-shot tickets live 15 minutes — long enough to click through the card,
   *  short enough that a forgotten approval never authorizes a much-later call. */
  static readonly TICKET_TTL_MS = 15 * 60_000;

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

  /** Is the action on the agent's always-allow list (case-insensitive)? */
  async isAlways(agentId: AgentId, action: string): Promise<boolean> {
    const record = await this.store.get(agentId);
    const a = action.toLowerCase();
    return record.always.some((x) => x.toLowerCase() === a);
  }

  /** The agent's always-allow list. */
  async always(agentId: AgentId): Promise<string[]> {
    return (await this.store.get(agentId)).always;
  }

  /** Add an action to the always-allow list (dedupe case-insensitively, keep the
   *  first casing), persist, and return the resulting list. */
  async allowAlways(agentId: AgentId, action: string): Promise<string[]> {
    return this.serialize(agentId, async () => {
      const record = await this.store.get(agentId);
      const a = action.toLowerCase();
      if (!record.always.some((x) => x.toLowerCase() === a)) {
        record.always.push(action);
      }
      const next = this.pruned(record);
      await this.store.put(agentId, next);
      return next.always;
    });
  }

  /** Remove an action from the always-allow list (case-insensitive match),
   *  persist, and return the resulting list. A clean miss (the action was not
   *  present) skips the redundant put and returns the current list unchanged,
   *  mirroring consumeTicket's clean-miss skip. */
  async disallowAlways(agentId: AgentId, action: string): Promise<string[]> {
    return this.serialize(agentId, async () => {
      const record = await this.store.get(agentId);
      const a = action.toLowerCase();
      const kept = record.always.filter((x) => x.toLowerCase() !== a);
      // Nothing removed → nothing changed on disk; skip the redundant write.
      if (kept.length === record.always.length) return record.always;
      const next = this.pruned({ always: kept, tickets: record.tickets });
      await this.store.put(agentId, next);
      return next.always;
    });
  }

  /** Write a one-shot ticket for a params-fingerprint hash (replacing an existing
   *  same-hash ticket's ts), pruning stale tickets, and persist. */
  async addTicket(
    agentId: AgentId,
    hash: string,
    now = Date.now(),
  ): Promise<void> {
    return this.serialize(agentId, async () => {
      const record = await this.store.get(agentId);
      record.tickets = record.tickets.filter((t) => t.hash !== hash);
      record.tickets.push({ hash, ts: now });
      await this.store.put(agentId, this.pruned(record, now));
    });
  }

  /**
   * Consume a one-shot ticket: true iff a FRESH (within TTL) ticket with that
   * hash exists — it is then removed (single use). Stale or missing → false. The
   * record is persisted ONLY when it actually changed (a fresh ticket consumed
   * OR stale tickets pruned), so a clean miss never does a redundant write.
   */
  async consumeTicket(
    agentId: AgentId,
    hash: string,
    now = Date.now(),
  ): Promise<boolean> {
    return this.serialize(agentId, async () => {
      const record = await this.store.get(agentId);
      const fresh = record.tickets.find(
        (t) => t.hash === hash && !this.isStale(t.ts, now),
      );
      const kept = record.tickets.filter(
        (t) => t !== fresh && !this.isStale(t.ts, now),
      );
      // A write is warranted only if we removed the consumed ticket or dropped
      // at least one stale one; otherwise nothing changed on disk.
      if (fresh || kept.length !== record.tickets.length) {
        await this.store.put(agentId, { always: record.always, tickets: kept });
      }
      return !!fresh;
    });
  }

  private isStale(ts: number, now: number): boolean {
    return now - ts > LocalActionApprovals.TICKET_TTL_MS;
  }

  /** Drop expired tickets so persisted state never accumulates dead grants. */
  private pruned(record: ApprovalRecord, now = Date.now()): ApprovalRecord {
    return {
      always: record.always,
      tickets: record.tickets.filter((t) => !this.isStale(t.ts, now)),
    };
  }
}
