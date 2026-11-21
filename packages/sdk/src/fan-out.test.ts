import { afterEach, describe, expect, test, vi } from "vitest";
import {
  AGENT_FAN_OUT_LIMIT,
  createFanOutGate,
  FAN_OUT_SLOT_LEASE_MS,
} from "./fan-out";

function controlledReads() {
  let inFlight = 0;
  let peak = 0;
  const pending: Array<{ settle: () => void }> = [];
  const read = <T>(value: T, fail = false) =>
    new Promise<T>((resolve, reject) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      pending.push({
        settle: () => {
          inFlight--;
          if (fail) reject(new Error(`failed ${String(value)}`));
          else resolve(value);
        },
      });
    });
  const settleAll = async () => {
    await new Promise((r) => setTimeout(r, 0));
    while (pending.length > 0) {
      for (const p of pending.splice(0)) p.settle();
      await new Promise((r) => setTimeout(r, 0));
    }
  };
  return { read, settleAll, peak: () => peak, started: () => pending.length };
}

describe("createFanOutGate", () => {
  test("never runs more reads at once than its limit", async () => {
    const reads = controlledReads();
    const gate = createFanOutGate({ limit: 3 });
    const ids = Array.from({ length: 20 }, (_, i) => `agent-${i}`);

    const done = gate.settle(ids, (id) => reads.read(id));
    await new Promise((r) => setTimeout(r, 0));
    expect(reads.started()).toBe(3);
    await reads.settleAll();
    const results = await done;

    expect(reads.peak()).toBe(3);
    expect(results).toHaveLength(20);
  });

  test("settles every item in input order, keeping failures", async () => {
    const reads = controlledReads();
    const gate = createFanOutGate({ limit: 2 });

    const done = gate.settle(["a", "b", "c"], (id) =>
      reads.read(id, id === "b"),
    );
    await reads.settleAll();
    const results = await done;

    expect(results.map((r) => r.status)).toEqual([
      "fulfilled",
      "rejected",
      "fulfilled",
    ]);
    expect(results[0]).toEqual({ status: "fulfilled", value: "a" });
    expect((results[1] as PromiseRejectedResult).reason).toBeInstanceOf(Error);
  });

  test("one gate bounds separate callers together", async () => {
    const reads = controlledReads();
    const gate = createFanOutGate({ limit: 4 });

    const sweep = gate.settle(
      Array.from({ length: 10 }, (_, i) => i),
      (i) => reads.read(i),
    );
    const singles = Array.from({ length: 10 }, (_, i) =>
      gate.run(() => reads.read(`config-${i}`)),
    );
    await reads.settleAll();
    await Promise.all([sweep, ...singles]);

    expect(reads.peak()).toBe(4);
  });

  test("run passes the read's value and rejection through", async () => {
    const gate = createFanOutGate({ limit: 1 });
    await expect(gate.run(async () => 42)).resolves.toBe(42);
    await expect(
      gate.run(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    await expect(gate.run(async () => "next")).resolves.toBe("next");
  });

  test("a read that throws synchronously frees its slot", async () => {
    const gate = createFanOutGate({ limit: 1 });
    await expect(
      gate.run(() => {
        throw new Error("sync");
      }),
    ).rejects.toThrow("sync");
    await expect(gate.run(async () => "after")).resolves.toBe("after");
  });

  test("the default limit is small enough to matter", () => {
    expect(AGENT_FAN_OUT_LIMIT).toBeGreaterThan(1);
    expect(AGENT_FAN_OUT_LIMIT).toBeLessThanOrEqual(16);
  });

  test("a limit below one is refused rather than hanging every read", () => {
    expect(() => createFanOutGate({ limit: 0 })).toThrow();
  });
});

describe("slot lease", () => {
  afterEach(() => vi.useRealTimers());

  test("a read held past the lease gives up its slot but keeps running", async () => {
    vi.useFakeTimers();
    const gate = createFanOutGate({ limit: 1 });
    let releaseHeld: (v: string) => void = () => {};
    const held = gate.run(() => new Promise<string>((r) => (releaseHeld = r)));
    let nextStarted = false;
    const next = gate.run(async () => {
      nextStarted = true;
      return "next";
    });

    await vi.advanceTimersByTimeAsync(FAN_OUT_SLOT_LEASE_MS - 1);
    expect(nextStarted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(nextStarted).toBe(true);
    await expect(next).resolves.toBe("next");

    releaseHeld("held");
    await expect(held).resolves.toBe("held");
  });

  test("a lease-expired read settling later does not free a second slot", async () => {
    vi.useFakeTimers();
    const gate = createFanOutGate({ limit: 1 });
    let releaseHeld: () => void = () => {};
    const held = gate.run(() => new Promise<void>((r) => (releaseHeld = r)));
    let releaseSecond: () => void = () => {};
    const second = gate.run(
      () => new Promise<void>((r) => (releaseSecond = r)),
    );
    let thirdStarted = false;
    const third = gate.run(async () => {
      thirdStarted = true;
    });

    await vi.advanceTimersByTimeAsync(FAN_OUT_SLOT_LEASE_MS);
    releaseHeld();
    await held;
    await vi.advanceTimersByTimeAsync(0);
    expect(thirdStarted).toBe(false);

    releaseSecond();
    await second;
    await third;
    expect(thirdStarted).toBe(true);
  });
});

describe("abort", () => {
  test("an aborted settle drops its queued reads without running them", async () => {
    const reads = controlledReads();
    const gate = createFanOutGate({ limit: 2 });
    const controller = new AbortController();
    let ran = 0;

    const done = gate.settle(
      ["a", "b", "c", "d", "e"],
      (id) => {
        ran++;
        return reads.read(id);
      },
      { signal: controller.signal },
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(ran).toBe(2);
    controller.abort();
    await reads.settleAll();
    const results = await done;

    expect(ran).toBe(2);
    expect(results.map((r) => r.status)).toEqual([
      "fulfilled",
      "fulfilled",
      "rejected",
      "rejected",
      "rejected",
    ]);
  });

  test("an aborted caller's queue never delays another caller", async () => {
    const reads = controlledReads();
    const gate = createFanOutGate({ limit: 1 });
    const controller = new AbortController();

    const stale = gate.settle(["x", "y", "z"], (id) => reads.read(id), {
      signal: controller.signal,
    });
    const fresh = gate.settle(["new"], (id) => reads.read(id));
    controller.abort();
    await reads.settleAll();

    expect((await fresh)[0]).toEqual({ status: "fulfilled", value: "new" });
    expect((await stale).filter((r) => r.status === "fulfilled")).toHaveLength(
      1,
    );
  });

  test("a settle that starts already aborted runs nothing", async () => {
    const gate = createFanOutGate();
    let ran = 0;
    const results = await gate.settle(
      ["a"],
      async () => {
        ran++;
      },
      { signal: AbortSignal.abort() },
    );
    expect(ran).toBe(0);
    expect(results[0].status).toBe("rejected");
  });
});
