import type {
  OrgBilling,
  OrgsList,
  SeatCheckoutOutcome,
} from "@houston/wire-types";
import { describe, expect, it, vi } from "vitest";
import { billingCheckoutOutstanding } from "./checkout-state";
import { BillingCheckoutTracker } from "./checkout-tracker";
import { freeOrgBilling, paidOrgBilling } from "./org-billing-fixtures";

const ORG = "00000000000000aa";
const orgs = (billing: OrgBilling | null, slug = ORG): OrgsList => ({
  orgs: [
    {
      id: `org-${slug}`,
      slug,
      name: "Acme",
      kind: "team",
      role: "owner",
      memberCount: 3,
      degraded: false,
      billing,
    },
  ],
  invites: [],
  freeOrg: null,
});
const free = orgs(freeOrgBilling());
const plus = orgs(paidOrgBilling());

function harness() {
  let now = 1_000;
  const timers: { at: number; run: () => void }[] = [];
  const tracker = new BillingCheckoutTracker({
    now: () => now,
    setTimeout: (run, ms) => timers.push({ at: now + ms, run }),
    clearTimeout: (handle) => {
      const index = handle - 1;
      if (timers[index]) timers[index].run = () => {};
    },
  });
  const advance = (ms: number) => {
    now += ms;
    for (const timer of timers) if (timer.at <= now) timer.run();
  };
  return { tracker, advance };
}

const checkout = (url: string): SeatCheckoutOutcome => ({
  kind: "checkout",
  url,
});

function ports(opened = true) {
  return {
    create: vi.fn(async () => checkout("https://checkout.stripe.test/s")),
    open: vi.fn(async () => opened),
  };
}

describe("a checkout is started once until it resolves", () => {
  it("refuses a second start while the first is being created or is open", async () => {
    const { tracker } = harness();
    const p = ports();
    const first = tracker.start(ORG, p);
    expect(billingCheckoutOutstanding(tracker.getSnapshot())).toBe(true);
    expect(await tracker.start(ORG, p)).toBe("skipped");
    expect(await first).toBe("started");
    expect(await tracker.start(ORG, p)).toBe("skipped");
    expect(p.create).toHaveBeenCalledTimes(1);
    expect(tracker.getSnapshot()).toMatchObject({
      phase: "open",
      url: "https://checkout.stripe.test/s",
      opened: true,
    });
  });

  it("keeps the checkout link when the browser did not open", async () => {
    const { tracker } = harness();
    await tracker.start(ORG, ports(false));
    expect(tracker.getSnapshot()).toMatchObject({
      phase: "open",
      url: "https://checkout.stripe.test/s",
      opened: false,
    });
  });

  it("frees the triggers again when creating the session fails", async () => {
    const { tracker } = harness();
    const failing = {
      ...ports(),
      create: vi.fn(async () => Promise.reject(new Error("503"))),
    };
    await expect(tracker.start(ORG, failing)).rejects.toThrow("503");
    expect(tracker.getSnapshot().phase).toBe("idle");
  });

  it("answers an interval refusal, back to idle, and opens nothing", async () => {
    const { tracker } = harness();
    const refused = {
      ...ports(),
      create: vi.fn(
        async (): Promise<SeatCheckoutOutcome> => ({
          kind: "interval_unavailable",
        }),
      ),
    };
    expect(await tracker.start(ORG, refused)).toBe("interval_unavailable");
    expect(refused.open).not.toHaveBeenCalled();
    expect(tracker.getSnapshot().phase).toBe("idle");
  });

  it("frees the triggers after ten minutes without payment", async () => {
    const { tracker, advance } = harness();
    const listener = vi.fn();
    tracker.subscribe(listener);
    await tracker.start(ORG, ports());
    advance(599_999);
    expect(tracker.getSnapshot().phase).toBe("open");
    advance(1);
    expect(tracker.getSnapshot().phase).toBe("idle");
    expect(listener).toHaveBeenCalled();
  });
});

describe("the outstanding checkout resolves when its org is paid up", () => {
  it("reports success exactly once, only for a checkout this app opened", async () => {
    const { tracker, advance } = harness();
    expect(tracker.observe(plus)).toBe(false);
    await tracker.start(ORG, ports());
    expect(tracker.getSnapshot()).toMatchObject({ orgSlug: ORG });
    expect(tracker.observe(free)).toBe(false);
    expect(tracker.observe(plus)).toBe(true);
    expect(tracker.observe(plus)).toBe(false);
    expect(tracker.getSnapshot()).toEqual({ phase: "succeeded", orgSlug: ORG });
    advance(600_000);
    expect(tracker.getSnapshot().phase).toBe("succeeded");
  });

  it("never reads a paid tier with a payment-failure lock as success", async () => {
    const { tracker } = harness();
    await tracker.start(ORG, ports());
    const failed = paidOrgBilling({
      status: "past_due",
      lockAt: "2026-10-12T00:00:00Z",
      lockReason: "payment_failed",
    });
    expect(tracker.observe(orgs(failed))).toBe(false);
    const canceling = paidOrgBilling({
      lockAt: "2026-11-01T00:00:00Z",
      lockReason: "canceled",
    });
    expect(tracker.observe(orgs(canceling))).toBe(false);
    expect(tracker.getSnapshot().phase).toBe("open");
    expect(tracker.observe(plus)).toBe(true);
  });

  it("only the org it was opened for resolves it", async () => {
    const { tracker } = harness();
    await tracker.start(ORG, ports());
    expect(tracker.observe(orgs(paidOrgBilling(), "00000000000000bb"))).toBe(
      false,
    );
    expect(tracker.observe(undefined)).toBe(false);
    expect(tracker.getSnapshot().phase).toBe("open");
  });
});

describe("an identity change forgets the checkout", () => {
  it("returns an open checkout to idle and cancels its expiry", async () => {
    const { tracker, advance } = harness();
    await tracker.start(ORG, ports());
    tracker.reset();
    expect(tracker.getSnapshot().phase).toBe("idle");
    advance(300_000);
    expect(await tracker.start(ORG, ports())).toBe("started");
    advance(300_000);
    expect(tracker.getSnapshot().phase).toBe("open");
  });

  it("returns a succeeded checkout to idle", async () => {
    const { tracker } = harness();
    await tracker.start(ORG, ports());
    tracker.observe(plus);
    tracker.reset();
    expect(tracker.getSnapshot().phase).toBe("idle");
  });

  it("drops a session the previous identity was still creating", async () => {
    const { tracker } = harness();
    let resolve: (value: SeatCheckoutOutcome) => void = () => {};
    const slow = {
      create: vi.fn(
        () => new Promise<SeatCheckoutOutcome>((r) => (resolve = r)),
      ),
      open: vi.fn(async () => true),
    };
    const started = tracker.start(ORG, slow);
    tracker.reset();
    resolve(checkout("https://checkout.stripe.test/s"));
    expect(await started).toBe("skipped");
    expect(slow.open).not.toHaveBeenCalled();
    expect(tracker.getSnapshot().phase).toBe("idle");
  });

  it("never hands the previous identity's link to the next checkout", async () => {
    const { tracker } = harness();
    let settleOpen: (opened: boolean) => void = () => {};
    const previous = {
      create: vi.fn(async () => checkout("https://checkout.stripe.test/old")),
      open: vi.fn(() => new Promise<boolean>((r) => (settleOpen = r))),
    };
    const oldStart = tracker.start(ORG, previous);
    await vi.waitFor(() => expect(previous.open).toHaveBeenCalled());
    tracker.reset();
    const next = {
      create: vi.fn(async () => checkout("https://checkout.stripe.test/new")),
      open: vi.fn(async () => true),
    };
    expect(await tracker.start(ORG, next)).toBe("started");
    settleOpen(false);
    await oldStart;
    expect(tracker.getSnapshot()).toMatchObject({
      phase: "open",
      url: "https://checkout.stripe.test/new",
      opened: true,
    });
  });
});

describe("a checkout the person walked away from ends", () => {
  it("ends on a cancel return for its own org, never on another's or a success", async () => {
    const { tracker } = harness();
    await tracker.start(ORG, ports());
    tracker.returned("00000000000000bb", "cancel");
    tracker.returned(ORG, "success");
    expect(tracker.getSnapshot().phase).toBe("open");
    tracker.returned(ORG, "cancel");
    expect(tracker.getSnapshot().phase).toBe("idle");
  });

  it("starts over: idle at once, then a new start makes a fresh session", async () => {
    const { tracker, advance } = harness();
    const p = ports();
    await tracker.start(ORG, p);
    advance(300_000);
    tracker.abandon("00000000000000bb");
    expect(tracker.getSnapshot().phase).toBe("open");
    tracker.abandon(ORG);
    expect(tracker.getSnapshot().phase).toBe("idle");
    expect(await tracker.start(ORG, p)).toBe("started");
    expect(p.create).toHaveBeenCalledTimes(2);
    // The abandoned checkout's window must not cut the new one short.
    advance(300_000);
    expect(tracker.getSnapshot().phase).toBe("open");
  });

  it("never lets a started-over page's failed open mark the next one", async () => {
    const { tracker } = harness();
    let settleOpen: (opened: boolean) => void = () => {};
    // The gateway answers the same session URL within the hour.
    const abandoned = {
      create: vi.fn(async () => checkout("https://checkout.stripe.test/s")),
      open: vi.fn(() => new Promise<boolean>((r) => (settleOpen = r))),
    };
    const oldStart = tracker.start(ORG, abandoned);
    await vi.waitFor(() => expect(abandoned.open).toHaveBeenCalled());
    tracker.abandon(ORG);
    expect(await tracker.start(ORG, ports())).toBe("started");
    settleOpen(false);
    await oldStart;
    expect(tracker.getSnapshot()).toMatchObject({
      phase: "open",
      url: "https://checkout.stripe.test/s",
      opened: true,
    });
  });

  it("leaves a success alone", async () => {
    const { tracker } = harness();
    await tracker.start(ORG, ports());
    tracker.observe(plus);
    tracker.returned(ORG, "cancel");
    tracker.abandon(ORG);
    expect(tracker.getSnapshot().phase).toBe("succeeded");
  });
});

describe("a success does not outlive the payment", () => {
  it("returns to idle once the org stops being paid up", async () => {
    const { tracker } = harness();
    await tracker.start(ORG, ports());
    tracker.observe(plus);
    expect(tracker.observe(free)).toBe(false);
    expect(tracker.getSnapshot().phase).toBe("idle");
  });
});

describe("the return page's hand-back belongs to the app that opened it", () => {
  it("is still this app's after the poll gave up, once", async () => {
    const { tracker, advance } = harness();
    await tracker.start(ORG, ports());
    advance(600_000);
    expect(tracker.getSnapshot().phase).toBe("idle");
    expect(tracker.claimReturn("00000000000000bb")).toBe(false);
    expect(tracker.claimReturn(ORG)).toBe(true);
    expect(tracker.claimReturn(ORG)).toBe(false);
  });

  it("lapses after a day, and on an identity change", async () => {
    const { tracker, advance } = harness();
    await tracker.start(ORG, ports());
    advance(86_400_000);
    expect(tracker.claimReturn(ORG)).toBe(false);
    const fresh = harness().tracker;
    await fresh.start(ORG, ports());
    fresh.reset();
    expect(fresh.claimReturn(ORG)).toBe(false);
  });

  it("is never claimed for a checkout that was refused", async () => {
    const { tracker } = harness();
    const refused = {
      ...ports(),
      create: vi.fn(
        async (): Promise<SeatCheckoutOutcome> => ({
          kind: "interval_unavailable",
        }),
      ),
    };
    await tracker.start(ORG, refused);
    expect(tracker.claimReturn(ORG)).toBe(false);
  });
});
