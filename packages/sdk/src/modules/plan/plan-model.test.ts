import type { PlanSummary } from "@houston/wire-types";
import { describe, expect, it } from "vitest";
import { messageLimitRefusal } from "../turns/turn-errors";
import { billingCards, planOffer } from "./billing-model";
import { freeScheduleAllowed, planLaunchRefreshDelay } from "./model";

const NOW = Date.parse("2026-10-05T00:00:00Z");
const free: PlanSummary = {
  plan: "free",
  announcement: false,
  usage: {
    percent: 100,
    used: 40,
    limit: 40,
    resetsAt: "2026-10-05T03:00:00Z",
  },
  plus: {
    status: "none",
    manageable: false,
    price: { amount: 1500, currency: "usd", interval: "month" },
  },
  routines: {
    paused: false,
    maxActive: 1,
    minIntervalMinutes: 15,
    needsChoice: false,
    limitedCount: 0,
  },
};

describe("plan refresh timing", () => {
  it("refetches when a blocked week resets so the composer unblocks", () => {
    expect(planLaunchRefreshDelay(free, NOW)).toBe(3 * 3_600_000 + 250);
  });

  it("never schedules past setTimeout's range", () => {
    const far = {
      ...free,
      usage: { ...free.usage, resetsAt: "2027-06-01T00:00:00Z" },
    } as PlanSummary;
    expect(planLaunchRefreshDelay(far, NOW)).toBe(2_147_483_647);
  });

  it("waits at least 30 seconds when the client clock is past an instant", () => {
    const skewed = {
      ...free,
      usage: { ...free.usage, resetsAt: "2026-10-04T23:59:00Z" },
    } as PlanSummary;
    expect(planLaunchRefreshDelay(skewed, NOW)).toBe(30_000);
  });

  it("does not poll a plan with nothing scheduled", () => {
    const { usage, ...rest } = free;
    expect(
      planLaunchRefreshDelay(
        { ...rest, usage: { ...usage, resetsAt: undefined } } as PlanSummary,
        NOW,
      ),
    ).toBe(false);
  });
});

describe("the early offer closes at offer.endsAt", () => {
  const ENDS = Date.parse("2026-10-01T06:28:00Z");
  const offered: PlanSummary = {
    ...free,
    limitsStartAt: "2026-10-01T07:00:00Z",
    usage: { percent: 10, used: 4, limit: 40 },
    plus: {
      ...free.plus,
      offer: {
        amount: 1000,
        currency: "usd",
        coversFrom: "2026-10-01T07:00:00Z",
        coversUntil: "2026-11-01T07:00:00Z",
        endsAt: "2026-10-01T06:28:00Z",
      },
    },
  };

  it("offers it until endsAt and hides it from that instant", () => {
    expect(planOffer(offered, "en-US", ENDS - 1)).not.toBeNull();
    expect(planOffer(offered, "en-US", ENDS)).toBeNull();
  });

  it("refetches at endsAt, before the launch", () => {
    const now = ENDS - 3_600_000;
    expect(planLaunchRefreshDelay(offered, now)).toBe(3_600_000 + 250);
  });
});

describe("Manage follows a real Stripe customer", () => {
  it("hides Manage for operator-granted Plus", () => {
    const operator: PlanSummary = {
      ...free,
      plan: "plus",
      plus: { ...free.plus, status: "active", manageable: false },
    };
    expect(billingCards(operator).manage).toBe(false);
    expect(
      billingCards({
        ...operator,
        plus: { ...operator.plus, manageable: true },
      }).manage,
    ).toBe(true);
  });
});

describe("Free cadence gate", () => {
  it("catches every schedule that fires more often than 15 minutes", () => {
    for (const cron of [
      "* * * * *",
      "*/5 * * * *",
      "0-59/5 * * * *",
      "0,5,10 * * * *",
      "0,5 9 * * 1",
      "55,0 * * * *",
    ])
      expect(freeScheduleAllowed(cron, free), cron).toBe(false);
  });

  it("allows cadences of 15 minutes or more, and everything on Plus", () => {
    for (const cron of [
      "*/15 * * * *",
      "0,20,40 * * * *",
      "0 9 * * 1-5",
      "30 8 1 * *",
    ])
      expect(freeScheduleAllowed(cron, free), cron).toBe(true);
    expect(freeScheduleAllowed("* * * * *", { ...free, plan: "plus" })).toBe(
      true,
    );
  });
});

describe("message limit from any transport", () => {
  const body = {
    error: "message limit reached",
    code: "message_limit",
    limit: 40,
    resetsAt: "2026-10-05T03:00:00Z",
  };

  it("recognizes the adapter's parsed-body error", () => {
    const error = Object.assign(new Error("engine request failed (429)"), {
      status: 429,
      body,
    });
    expect(messageLimitRefusal(error)).toEqual(body);
  });

  it("recognizes an SDK REST error carrying the body as its message", () => {
    const error = Object.assign(new Error(JSON.stringify(body)), {
      status: 429,
    });
    expect(messageLimitRefusal(error)).toEqual(body);
  });

  it("ignores other statuses and codes", () => {
    expect(
      messageLimitRefusal(Object.assign(new Error(""), { status: 503, body })),
    ).toBeNull();
    expect(
      messageLimitRefusal(
        Object.assign(new Error(""), {
          status: 429,
          body: { code: "rate_limited" },
        }),
      ),
    ).toBeNull();
  });
});
