import type {
  OrgRoutines,
  TriggerPlanSkipCode,
  TriggerStatusItem,
} from "@houston/wire-types";
import { describe, expect, it } from "vitest";
import {
  FREE_ORG_ROUTINES,
  freeOrgBilling,
  paidOrgBilling,
} from "./org-billing-fixtures";
import {
  type TriggerPlanSkipViewer,
  triggerPlanSkipNotice,
} from "./trigger-skip-notice";

const free = freeOrgBilling();
const plus = paidOrgBilling();
const LAST = "2026-10-05T19:43:49Z";
const creator: TriggerPlanSkipViewer = {
  createdBy: "u1",
  viewerId: "u1",
  agentSlug: "agent-a",
  plusOffer: true,
};
const member: TriggerPlanSkipViewer = { ...creator, viewerId: "u2" };
const item = (code: TriggerPlanSkipCode, count = 21): TriggerStatusItem => ({
  routine_id: "r1",
  status: "active",
  plan_skipped: { code, count, last_at: LAST },
});
const withRoutines = (patch: Partial<OrgRoutines>) =>
  freeOrgBilling({ routines: { ...FREE_ORG_ROUTINES, ...patch } });
const kept = (agentSlug: string, routineId = "r1") =>
  withRoutines({ kept: { agentSlug, routineId } });

describe("triggerPlanSkipNotice for the routine's creator", () => {
  it("says nothing without skipped runs", () => {
    expect(triggerPlanSkipNotice(undefined, free, creator)).toBeNull();
    expect(
      triggerPlanSkipNotice(
        { routine_id: "r1", status: "active" },
        free,
        creator,
      ),
    ).toBeNull();
    expect(
      triggerPlanSkipNotice(item("plan_min_interval", 0), free, creator),
    ).toBeNull();
  });

  it("speaks only while the org is free", () => {
    const skipped = item("plan_min_interval");
    expect(triggerPlanSkipNotice(skipped, undefined, creator)).toBeNull();
    expect(triggerPlanSkipNotice(skipped, null, creator)).toBeNull();
    expect(triggerPlanSkipNotice(skipped, plus, creator)).toBeNull();
  });

  it("names the minimum interval from the org's billing and offers an upgrade", () => {
    expect(
      triggerPlanSkipNotice(item("plan_min_interval"), free, creator),
    ).toEqual({
      reason: "min_interval",
      count: 21,
      lastAt: LAST,
      minIntervalMinutes: 15,
      actions: ["upgrade"],
    });
    const bare = freeOrgBilling({ routines: null });
    expect(
      triggerPlanSkipNotice(item("plan_min_interval"), bare, creator),
    ).toMatchObject({ minIntervalMinutes: 15 });
  });

  it("offers to keep this routine, until it is the kept one", () => {
    expect(
      triggerPlanSkipNotice(item("plan_routine_limit", 3), free, creator),
    ).toEqual({
      reason: "routine_limit",
      count: 3,
      lastAt: LAST,
      actions: ["keep_routine", "upgrade"],
    });
    const keptHere = kept("agent-a");
    expect(
      triggerPlanSkipNotice(item("plan_routine_limit"), keptHere, creator),
    ).toBeNull();
  });

  it("matches the kept routine by its agent and id", () => {
    const limit = item("plan_routine_limit");
    // Same routine id under another agent, or another routine: still refused.
    for (const stale of [kept("agent-b"), kept("agent-a", "r9")])
      expect(triggerPlanSkipNotice(limit, stale, creator)?.reason).toBe(
        "routine_limit",
      );
  });

  it("offers Resume first and never the chooser while routines are paused", () => {
    const paused = withRoutines({ paused: true });
    expect(
      triggerPlanSkipNotice(item("plan_routine_limit"), paused, creator),
    ).toMatchObject({
      reason: "routine_limit_paused",
      actions: ["resume", "upgrade"],
    });
    expect(
      triggerPlanSkipNotice(item("plan_inactive"), paused, creator),
    ).toMatchObject({
      reason: "inactive_paused",
      actions: ["resume", "upgrade"],
    });
    expect(
      triggerPlanSkipNotice(item("plan_inactive"), free, creator),
    ).toMatchObject({ reason: "inactive_resumed", actions: ["upgrade"] });
  });

  it("offers only the way to pay in a locked org", () => {
    const locked = freeOrgBilling({
      status: "locked",
      lockAt: "2026-10-01T00:00:00Z",
      lockReason: "migration",
      routines: { ...FREE_ORG_ROUTINES, paused: true },
    });
    for (const code of ["plan_routine_limit", "plan_inactive"] as const) {
      expect(
        triggerPlanSkipNotice(item(code), locked, creator)?.actions,
      ).toEqual(["upgrade"]);
      expect(
        triggerPlanSkipNotice(item(code), locked, {
          ...creator,
          plusOffer: false,
        })?.actions,
      ).toEqual([]);
    }
  });

  it("never offers Plus where it would not pay for the org", () => {
    const team = { ...creator, plusOffer: false };
    expect(
      triggerPlanSkipNotice(item("plan_routine_limit"), free, team)?.actions,
    ).toEqual(["keep_routine"]);
    expect(
      triggerPlanSkipNotice(item("plan_min_interval"), free, team)?.actions,
    ).toEqual([]);
  });

  it("ignores a code it cannot explain", () => {
    const unknown = {
      routine_id: "r1",
      status: "active",
      plan_skipped: { code: "plan_future_rule", count: 2, last_at: LAST },
    } as unknown as TriggerStatusItem;
    expect(triggerPlanSkipNotice(unknown, free, creator)).toBeNull();
    expect(triggerPlanSkipNotice(unknown, free, member)).toBeNull();
  });
});

describe("triggerPlanSkipNotice for a routine naming no creator", () => {
  // An Agent Store install or an import strips `created_by`: it is the
  // viewer's own routine, judged like the creator's.
  const owner = { ...creator, createdBy: undefined };

  it("offers the viewer in a free org what fixes it", () => {
    expect(
      triggerPlanSkipNotice(item("plan_routine_limit"), free, owner),
    ).toMatchObject({
      reason: "routine_limit",
      actions: ["keep_routine", "upgrade"],
    });
    expect(
      triggerPlanSkipNotice(item("plan_min_interval"), free, {
        ...owner,
        viewerId: null,
      }),
    ).toMatchObject({ reason: "min_interval", actions: ["upgrade"] });
  });

  it("says nothing in a paid org", () => {
    expect(
      triggerPlanSkipNotice(item("plan_min_interval"), plus, owner),
    ).toBeNull();
  });
});

describe("triggerPlanSkipNotice for anyone else", () => {
  const readOnly = {
    reason: "creator_plan",
    count: 21,
    lastAt: LAST,
    actions: [],
  };

  it("gives a teammate the read-only notice, whatever the org's tier", () => {
    for (const plan of [free, plus, undefined, withRoutines({ paused: true })])
      for (const code of [
        "plan_min_interval",
        "plan_routine_limit",
        "plan_inactive",
      ] as const)
        expect(triggerPlanSkipNotice(item(code), plan, member)).toEqual(
          readOnly,
        );
  });

  it("waits for the session before choosing a variant", () => {
    expect(
      triggerPlanSkipNotice(item("plan_min_interval"), free, {
        ...creator,
        viewerId: null,
      }),
    ).toBeNull();
  });
});
