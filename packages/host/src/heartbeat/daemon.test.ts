import { afterEach, expect, test, vi } from "vitest";
import { HeartbeatDaemon } from "./daemon";
import type { HeartbeatRunner } from "./runner";

afterEach(() => {
  vi.useRealTimers();
});

test("ticks every interval until stopped, and logs a failed tick", async () => {
  vi.useFakeTimers();
  const tick = vi
    .fn()
    .mockRejectedValueOnce(new Error("store down"))
    .mockResolvedValue({ kind: "not_due" });
  const log = vi.fn();
  const daemon = new HeartbeatDaemon(
    { tick } as unknown as HeartbeatRunner,
    log,
    1_000,
  );
  daemon.start();
  daemon.start(); // idempotent: still one timer
  await vi.advanceTimersByTimeAsync(2_000);
  expect(tick).toHaveBeenCalledTimes(2);
  expect(log).toHaveBeenCalledWith(
    "[heartbeat] tick failed:",
    expect.any(Error),
  );
  daemon.stop();
  await vi.advanceTimersByTimeAsync(5_000);
  expect(tick).toHaveBeenCalledTimes(2);
});

test("skips the tick while the previous attempt is still running", async () => {
  vi.useFakeTimers();
  let release: () => void = () => {};
  const tick = vi.fn(
    () =>
      new Promise((resolve) => {
        release = () => resolve({ kind: "not_due" });
      }),
  );
  const daemon = new HeartbeatDaemon(
    { tick } as unknown as HeartbeatRunner,
    vi.fn(),
    1_000,
  );
  daemon.start();
  await vi.advanceTimersByTimeAsync(3_000);
  expect(tick).toHaveBeenCalledTimes(1);
  release();
  await vi.advanceTimersByTimeAsync(1_000);
  expect(tick).toHaveBeenCalledTimes(2);
  daemon.stop();
});
