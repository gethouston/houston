import { expect, test } from "vitest";
import {
  type ActionApprovalStore,
  type ApprovalRecord,
  MemoryActionApprovalStore,
} from "./action-approval-store";
import { LocalActionApprovals } from "./action-approvals";

/**
 * The action-approval policy: case-insensitive grant match, grant refresh (not
 * duplicate) for a re-confirmed action, TTL expiry (a stale grant is neither
 * honored nor left on disk), and per-agent serialization of writes.
 */

const AGENT = "Personal/Assistant";
const ACTION = "GMAIL_SEND";
const TTL = LocalActionApprovals.GRANT_TTL_MS;

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
    return r ? { grants: r.grants.map((g) => ({ ...g })) } : { grants: [] };
  }
  async put(agentId: string, record: ApprovalRecord): Promise<void> {
    this.puts++;
    await tick();
    this.byAgent.set(agentId, { grants: record.grants.map((g) => ({ ...g })) });
  }
}

test("grant is honored for the same action case-insensitively", async () => {
  const { approvals } = make();
  await approvals.grant(AGENT, "Gmail_Send");
  expect(await approvals.isGranted(AGENT, "gmail_send")).toBe(true);
  expect(await approvals.isGranted(AGENT, "GMAIL_SEND")).toBe(true);
  expect(await approvals.isGranted(AGENT, "SLACK_POST")).toBe(false);
});

test("re-granting the same action refreshes its ts, not duplicates it", async () => {
  const { store, approvals } = make();
  await approvals.grant(AGENT, "Gmail_Send", 1000);
  await approvals.grant(AGENT, "GMAIL_SEND", 2000);
  const record = await store.get(AGENT);
  expect(record.grants).toEqual([{ action: "GMAIL_SEND", ts: 2000 }]);
});

test("a stale grant is not honored and is pruned on the next write", async () => {
  const { store, approvals } = make();
  const t0 = 1_000_000;
  await approvals.grant(AGENT, ACTION, t0);
  // Just past the TTL: no longer granted.
  expect(await approvals.isGranted(AGENT, ACTION, t0 + TTL + 1)).toBe(false);
  // A later grant of another action prunes the dead one while writing.
  await approvals.grant(AGENT, "SLACK_POST", t0 + TTL + 1);
  const record: ApprovalRecord = await store.get(AGENT);
  expect(record.grants.map((g) => g.action)).toEqual(["SLACK_POST"]);
});

test("a grant at exactly the TTL boundary is still fresh", async () => {
  const { approvals } = make();
  const t0 = 5_000;
  await approvals.grant(AGENT, ACTION, t0);
  expect(await approvals.isGranted(AGENT, ACTION, t0 + TTL)).toBe(true);
});

test("concurrent grants for one agent serialize (no lost write)", async () => {
  const store = new SlowStore();
  const approvals = new LocalActionApprovals({ store });
  // Fire two grants of DIFFERENT slugs at once: without per-agent serialization
  // they'd both read the same base record and one write would clobber the other.
  // Serialized, the final state reflects both.
  await Promise.all([
    approvals.grant(AGENT, "GMAIL_SEND", 1000),
    approvals.grant(AGENT, "SLACK_POST", 1000),
  ]);
  const record = await store.get(AGENT);
  expect(record.grants.map((g) => g.action).sort()).toEqual([
    "GMAIL_SEND",
    "SLACK_POST",
  ]);
});
