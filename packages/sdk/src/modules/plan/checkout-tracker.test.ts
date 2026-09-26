import type { PlanSummary } from "@houston/wire-types";
import { describe, expect, it, vi } from "vitest";
import {
  PlusCheckoutTracker,
  plusCheckoutOutstanding,
} from "./checkout-tracker";

const free = { plan: "free" } as PlanSummary;
const plus = { plan: "plus" } as PlanSummary;

function harness() {
  let now = 1_000;
  const timers: { at: number; run: () => void }[] = [];
  const tracker = new PlusCheckoutTracker({
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

function ports(opened = true) {
  return {
    create: vi.fn(async () => ({ url: "https://checkout.stripe.test/s" })),
    open: vi.fn(async () => opened),
  };
}

describe("a Plus checkout is started once until it resolves", () => {
  it("refuses a second start while the first is being created or is open", async () => {
    const { tracker } = harness();
    const p = ports();
    const first = tracker.start(p);
    expect(plusCheckoutOutstanding(tracker.getSnapshot())).toBe(true);
    expect(await tracker.start(p)).toBe(false);
    expect(await first).toBe(true);
    expect(await tracker.start(p)).toBe(false);
    expect(p.create).toHaveBeenCalledTimes(1);
    expect(tracker.getSnapshot()).toMatchObject({
      phase: "open",
      fallbackUrl: null,
    });
  });

  it("keeps the checkout link when the browser did not open", async () => {
    const { tracker } = harness();
    await tracker.start(ports(false));
    expect(tracker.getSnapshot()).toMatchObject({
      phase: "open",
      fallbackUrl: "https://checkout.stripe.test/s",
    });
  });

  it("frees the triggers again when creating the session fails", async () => {
    const { tracker } = harness();
    const failing = {
      ...ports(),
      create: vi.fn(async () => Promise.reject(new Error("503"))),
    };
    await expect(tracker.start(failing)).rejects.toThrow("503");
    expect(tracker.getSnapshot().phase).toBe("idle");
  });

  it("frees the triggers after ten minutes without Plus", async () => {
    const { tracker, advance } = harness();
    const listener = vi.fn();
    tracker.subscribe(listener);
    await tracker.start(ports());
    advance(599_999);
    expect(tracker.getSnapshot().phase).toBe("open");
    advance(1);
    expect(tracker.getSnapshot().phase).toBe("idle");
    expect(listener).toHaveBeenCalled();
  });
});

describe("the outstanding checkout resolves when the plan turns Plus", () => {
  it("reports success exactly once, only for a checkout this app opened", async () => {
    const { tracker, advance } = harness();
    expect(tracker.observe(plus)).toBe(false);
    await tracker.start(ports());
    expect(tracker.observe(free)).toBe(false);
    expect(tracker.observe(plus)).toBe(true);
    expect(tracker.observe(plus)).toBe(false);
    expect(tracker.getSnapshot().phase).toBe("succeeded");
    advance(600_000);
    expect(tracker.getSnapshot().phase).toBe("succeeded");
  });
});

describe("an identity change forgets the checkout", () => {
  it("returns an open checkout to idle and cancels its expiry", async () => {
    const { tracker, advance } = harness();
    await tracker.start(ports());
    tracker.reset();
    expect(tracker.getSnapshot().phase).toBe("idle");
    advance(300_000);
    expect(await tracker.start(ports())).toBe(true);
    advance(300_000);
    expect(tracker.getSnapshot().phase).toBe("open");
  });

  it("returns a succeeded checkout to idle", async () => {
    const { tracker } = harness();
    await tracker.start(ports());
    tracker.observe(plus);
    tracker.reset();
    expect(tracker.getSnapshot().phase).toBe("idle");
  });

  it("drops a session the previous identity was still creating", async () => {
    const { tracker } = harness();
    let resolve: (value: { url: string }) => void = () => {};
    const slow = {
      create: vi.fn(() => new Promise<{ url: string }>((r) => (resolve = r))),
      open: vi.fn(async () => true),
    };
    const started = tracker.start(slow);
    tracker.reset();
    resolve({ url: "https://checkout.stripe.test/s" });
    expect(await started).toBe(false);
    expect(slow.open).not.toHaveBeenCalled();
    expect(tracker.getSnapshot().phase).toBe("idle");
  });

  it("never hands the previous identity's link to the next checkout", async () => {
    const { tracker } = harness();
    let settleOpen: (opened: boolean) => void = () => {};
    const previous = {
      create: vi.fn(async () => ({ url: "https://checkout.stripe.test/old" })),
      open: vi.fn(() => new Promise<boolean>((r) => (settleOpen = r))),
    };
    const oldStart = tracker.start(previous);
    await vi.waitFor(() => expect(previous.open).toHaveBeenCalled());
    tracker.reset();
    const next = {
      create: vi.fn(async () => ({ url: "https://checkout.stripe.test/new" })),
      open: vi.fn(async () => true),
    };
    expect(await tracker.start(next)).toBe(true);
    settleOpen(false);
    await oldStart;
    expect(tracker.getSnapshot()).toMatchObject({
      phase: "open",
      fallbackUrl: null,
    });
  });
});

describe("a success does not outlive the Plus plan", () => {
  it("returns to idle once the plan reads Free again", async () => {
    const { tracker } = harness();
    await tracker.start(ports());
    tracker.observe(plus);
    expect(tracker.observe(free)).toBe(false);
    expect(tracker.getSnapshot().phase).toBe("idle");
  });
});
