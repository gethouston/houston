import { expect, test } from "vitest";
import {
  type ActionApprovalStore,
  type ApprovalRecord,
  MemoryActionApprovalStore,
} from "./action-approval-store";
import { LocalActionApprovals } from "./action-approvals";

/**
 * The action-approval policy: case-insensitive always-allow dedupe, single-use
 * ticket consumption, and TTL expiry (a stale ticket is neither consumable nor
 * left on disk).
 */

const AGENT = "Personal/Assistant";
const HASH = "0123456789abcdef";
const TTL = LocalActionApprovals.TICKET_TTL_MS;

function make() {
  const store = new MemoryActionApprovalStore();
  return { store, approvals: new LocalActionApprovals({ store }) };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

/**
 * A store whose get/put yield a macrotask, so two concurrent mutating ops
 * interleave (both read the same record before either writes) UNLESS the policy
 * serializes them per agent — the exact RMW race the mutex must close.
 */
class SlowStore implements ActionApprovalStore {
  private readonly byAgent = new Map<string, ApprovalRecord>();
  puts = 0;
  async get(agentId: string): Promise<ApprovalRecord> {
    await tick();
    const r = this.byAgent.get(agentId);
    return r
      ? { always: [...r.always], tickets: r.tickets.map((t) => ({ ...t })) }
      : { always: [], tickets: [] };
  }
  async put(agentId: string, record: ApprovalRecord): Promise<void> {
    this.puts++;
    await tick();
    this.byAgent.set(agentId, {
      always: [...record.always],
      tickets: record.tickets.map((t) => ({ ...t })),
    });
  }
}

test("allowAlways dedupes case-insensitively and keeps the first casing", async () => {
  const { approvals } = make();
  await approvals.allowAlways(AGENT, "Gmail_Send");
  const list = await approvals.allowAlways(AGENT, "GMAIL_SEND");
  expect(list).toEqual(["Gmail_Send"]);
  expect(await approvals.isAlways(AGENT, "gmail_send")).toBe(true);
  expect(await approvals.isAlways(AGENT, "SLACK_POST")).toBe(false);
});

test("a ticket is consumable exactly once", async () => {
  const { approvals } = make();
  await approvals.addTicket(AGENT, HASH);
  expect(await approvals.consumeTicket(AGENT, HASH)).toBe(true);
  expect(await approvals.consumeTicket(AGENT, HASH)).toBe(false);
});

test("re-adding a ticket for the same hash refreshes its ts, not duplicates", async () => {
  const { store, approvals } = make();
  await approvals.addTicket(AGENT, HASH, 1000);
  await approvals.addTicket(AGENT, HASH, 2000);
  const record = await store.get(AGENT);
  expect(record.tickets).toEqual([{ hash: HASH, ts: 2000 }]);
});

test("a stale ticket is not consumable and is pruned from the store", async () => {
  const { store, approvals } = make();
  const t0 = 1_000_000;
  await approvals.addTicket(AGENT, HASH, t0);
  // Attempt to consume just past the TTL: refused, and the dead ticket is gone.
  expect(await approvals.consumeTicket(AGENT, HASH, t0 + TTL + 1)).toBe(false);
  const record: ApprovalRecord = await store.get(AGENT);
  expect(record.tickets).toEqual([]);
});

test("a ticket at exactly the TTL boundary is still fresh", async () => {
  const { approvals } = make();
  const t0 = 5_000;
  await approvals.addTicket(AGENT, HASH, t0);
  expect(await approvals.consumeTicket(AGENT, HASH, t0 + TTL)).toBe(true);
});

test("addTicket prunes other stale tickets while writing a fresh one", async () => {
  const { store, approvals } = make();
  await approvals.addTicket(AGENT, "aaaaaaaaaaaaaaaa", 0);
  await approvals.addTicket(AGENT, "bbbbbbbbbbbbbbbb", TTL + 2);
  const record = await store.get(AGENT);
  expect(record.tickets.map((t) => t.hash)).toEqual(["bbbbbbbbbbbbbbbb"]);
});

test("two concurrent consumeTicket calls consume a fresh ticket exactly once", async () => {
  const store = new SlowStore();
  const approvals = new LocalActionApprovals({ store });
  await approvals.addTicket(AGENT, HASH);
  // Both fire before either resolves — without per-agent serialization both read
  // the fresh ticket and both return true (a double-consume / resurrection).
  const [a, b] = await Promise.all([
    approvals.consumeTicket(AGENT, HASH),
    approvals.consumeTicket(AGENT, HASH),
  ]);
  expect([a, b].filter(Boolean).length).toBe(1);
});

test("consumeTicket on a clean miss does not write (nothing to prune or remove)", async () => {
  const store = new SlowStore();
  const approvals = new LocalActionApprovals({ store });
  const before = store.puts;
  expect(await approvals.consumeTicket(AGENT, HASH)).toBe(false);
  // A miss against an empty record changed nothing → no redundant put.
  expect(store.puts).toBe(before);
});
