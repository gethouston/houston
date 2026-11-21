import { afterEach, expect, test, vi } from "vitest";
import { FENCE_RETIRE_DRAIN_MS, respondToFenceLoss } from "./fence-retire";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function harness(stop: (opts: { drainMs: number }) => Promise<void>) {
  const events: string[] = [];
  const respond = respondToFenceLoss({
    agent: "acme/writer",
    stop: async (opts) => {
      events.push(`stop ${opts.drainMs}`);
      await stop(opts);
    },
    standDown: async (drainMs) => {
      events.push(`stand down ${drainMs}`);
    },
    exit: (code) => events.push(`exit ${code}`),
    flushReports: async () => events.push("flush"),
    deadlineMs: 1_000,
  });
  return { respond, events };
}

test("with nobody holding the lease the pod stops on a short drain, reports, then exits non-zero", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const { respond, events } = harness(async () => {});

  respond("stale");
  respond("stale");
  await vi.waitFor(() => expect(events).toContain("exit 1"));
  expect(events).toEqual([`stop ${FENCE_RETIRE_DRAIN_MS}`, "flush", "exit 1"]);
  expect(error).toHaveBeenCalledOnce();
  expect(error.mock.calls[0]?.[0]).toContain(
    "[local-host] fence retire agent=acme/writer reason=stale_holder",
  );
});

test("a running engine holding the lease makes the pod stand down, not exit", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { respond, events } = harness(async () => {});

  respond("live");
  respond("live");
  expect(events).toEqual([`stand down ${FENCE_RETIRE_DRAIN_MS}`]);

  respond("stale");
  await vi.waitFor(() => expect(events).toContain("exit 1"));
  expect(events).toEqual([
    `stand down ${FENCE_RETIRE_DRAIN_MS}`,
    `stop ${FENCE_RETIRE_DRAIN_MS}`,
    "flush",
    "exit 1",
  ]);
});

test("a stop that hangs cannot keep the fenced pod serving", async () => {
  vi.useFakeTimers();
  vi.spyOn(console, "error").mockImplementation(() => {});
  const { respond, events } = harness(() => new Promise<void>(() => {}));

  respond("stale");
  await vi.advanceTimersByTimeAsync(999);
  expect(events).not.toContain("exit 1");
  await vi.advanceTimersByTimeAsync(1);
  expect(events).toContain("exit 1");
});

test("a stop that fails still exits", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const { respond, events } = harness(async () => {
    throw new Error("server close failed");
  });

  respond("stale");
  await vi.waitFor(() => expect(events).toContain("exit 1"));
  expect(error).toHaveBeenCalledWith(
    "[local-host] retire stop failed; exiting anyway:",
    expect.objectContaining({ message: "server close failed" }),
  );
});
