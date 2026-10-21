import { describe, expect, it } from "vitest";
import { messageLimitRefusal } from "../turns/turn-errors";
import {
  planComposerMode,
  planDialog,
  planLaunchRefreshDelay,
  usagePercent,
} from "./model";
import {
  FREE_ORG_ROUTINES,
  freeOrgBilling,
  paidOrgBilling,
  withUsage,
} from "./org-billing-fixtures";

const NOW = Date.parse("2026-10-05T00:00:00Z");
const atLimit = withUsage(40, 40);

describe("the free org's pool", () => {
  it("reads as a whole percentage of the shared limit", () => {
    expect(usagePercent(freeOrgBilling())).toBe(25);
    expect(usagePercent(withUsage(99.9))).toBe(99);
    expect(usagePercent(withUsage(130))).toBe(100);
    expect(usagePercent(withUsage(0, 0))).toBe(100);
  });

  it("is absent on a paid org, a legacy org, and an unread list", () => {
    expect(usagePercent(paidOrgBilling())).toBeNull();
    expect(usagePercent(null)).toBeNull();
    expect(usagePercent(undefined)).toBeNull();
    expect(usagePercent(freeOrgBilling({ usage: null }))).toBeNull();
  });

  it("drives the composer: the hint from 80 percent, the limit at 100", () => {
    expect(planComposerMode(withUsage(79))).toBe("none");
    expect(planComposerMode(withUsage(80))).toBe("hint");
    expect(planComposerMode(atLimit)).toBe("limit");
    expect(planComposerMode(paidOrgBilling())).toBe("none");
  });
});

describe("plan refresh timing", () => {
  it("refetches when a blocked week resets so the composer unblocks", () => {
    expect(planLaunchRefreshDelay(atLimit, NOW)).toBe(3 * 3_600_000 + 250);
  });

  it("refetches at a scheduled lock before the reset", () => {
    const locking = freeOrgBilling({ lockAt: "2026-10-05T01:00:00Z" });
    expect(planLaunchRefreshDelay(locking, NOW)).toBe(3_600_000 + 250);
  });

  it("never schedules past setTimeout's range", () => {
    const far = freeOrgBilling({
      usage: {
        scope: "org",
        used: 1,
        limit: 40,
        resetsAt: "2027-06-01T00:00:00Z",
      },
    });
    expect(planLaunchRefreshDelay(far, NOW)).toBe(2_147_483_647);
  });

  it("waits at least 30 seconds when the client clock is past the reset", () => {
    const skewed = freeOrgBilling({
      usage: {
        scope: "org",
        used: 40,
        limit: 40,
        resetsAt: "2026-10-04T23:59:00Z",
      },
    });
    expect(planLaunchRefreshDelay(skewed, NOW)).toBe(30_000);
  });

  it("does not poll a locked org or one with nothing scheduled", () => {
    expect(planLaunchRefreshDelay(paidOrgBilling(), NOW)).toBe(false);
    const locked = paidOrgBilling({
      status: "locked",
      lockAt: "2026-10-01T00:00:00Z",
    });
    expect(planLaunchRefreshDelay(locked, NOW)).toBe(false);
    expect(planLaunchRefreshDelay(undefined, NOW)).toBe(false);
  });
});

describe("the shell's plan dialog", () => {
  const closed = {
    resumeDismissed: false,
    keepDismissed: false,
    keepRequested: false,
    announcement: false,
  };
  const paused = freeOrgBilling({
    routines: { ...FREE_ORG_ROUTINES, paused: true, needsChoice: true },
  });

  it("asks a free org to resume first, then to choose a routine", () => {
    expect(planDialog(paused, closed)).toBe("resume");
    expect(planDialog(paused, { ...closed, resumeDismissed: true })).toBe(
      "keep",
    );
    expect(
      planDialog(paused, {
        ...closed,
        resumeDismissed: true,
        keepDismissed: true,
      }),
    ).toBeNull();
  });

  it("opens the chooser on request, but only for a free org", () => {
    expect(
      planDialog(freeOrgBilling(), { ...closed, keepRequested: true }),
    ).toBe("keep");
    expect(
      planDialog(paidOrgBilling(), { ...closed, keepRequested: true }),
    ).toBeNull();
  });

  it("shows the announcement only when no routine dialog is due", () => {
    expect(planDialog(paused, { ...closed, announcement: true })).toBe(
      "resume",
    );
    expect(
      planDialog(paidOrgBilling(), { ...closed, announcement: true }),
    ).toBe("announcement");
    expect(planDialog(undefined, closed)).toBeNull();
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

  it("carries whose allowance ran out, and drops a scope it does not know", () => {
    const org = Object.assign(new Error(""), {
      status: 429,
      body: { ...body, scope: "org" },
    });
    expect(messageLimitRefusal(org)).toEqual({ ...body, scope: "org" });
    const later = Object.assign(new Error(""), {
      status: 429,
      body: { ...body, scope: "team" },
    });
    expect(messageLimitRefusal(later)).toEqual(body);
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
