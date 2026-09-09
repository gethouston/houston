import { afterEach, expect, test, vi } from "vitest";
import { bootstrapLocalModelBridge } from "./bootstrap";

afterEach(() => vi.useRealTimers());
test("discovery retries only the factory and returns its first successful result", async () => {
  vi.useFakeTimers();
  const controller = {};
  const factory = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(controller);
  const result = bootstrapLocalModelBridge(
    factory,
    new AbortController().signal,
    { report: vi.fn(), random: () => 0 },
  );
  await vi.advanceTimersByTimeAsync(500);
  expect(await result).toBe(controller);
  expect(factory).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(120_000);
  expect(factory).toHaveBeenCalledTimes(2);
});
test("cancellation removes pending retry and stops discovery", async () => {
  vi.useFakeTimers();
  const abort = new AbortController();
  const factory = vi.fn().mockRejectedValue(new Error("offline"));
  const result = bootstrapLocalModelBridge(factory, abort.signal, {
    report: vi.fn(),
    random: () => 0,
  });
  const rejected = expect(result).rejects.toMatchObject({ name: "AbortError" });
  await vi.advanceTimersByTimeAsync(1);
  abort.abort();
  await rejected;
  await vi.advanceTimersByTimeAsync(120_000);
  expect(factory).toHaveBeenCalledTimes(1);
});
test("authentication denial and unsupported capabilities never retry", async () => {
  vi.useFakeTimers();
  const factory = vi.fn().mockRejectedValue({ status: 403 });
  await expect(
    bootstrapLocalModelBridge(factory, new AbortController().signal, {
      report: vi.fn(),
    }),
  ).rejects.toEqual({ status: 403 });
  expect(factory).toHaveBeenCalledTimes(1);
  expect(
    await bootstrapLocalModelBridge(
      async () => null,
      new AbortController().signal,
      { report: vi.fn() },
    ),
  ).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});
test("an unsupported deployment is terminal: one attempt, no retry, no report", async () => {
  vi.useFakeTimers();
  const report = vi.fn();
  const unsupported = Object.assign(new Error("not here"), {
    status: 503,
    body: { code: "bridge_not_supported" },
  });
  const factory = vi.fn().mockRejectedValue(unsupported);
  await expect(
    bootstrapLocalModelBridge(factory, new AbortController().signal, {
      report,
      random: () => 0,
    }),
  ).rejects.toBe(unsupported);
  expect(factory).toHaveBeenCalledTimes(1);
  expect(report).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
test("a failing streak is reported once, and again only when its cause changes", async () => {
  vi.useFakeTimers();
  const report = vi.fn();
  const controller = {};
  const factory = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockRejectedValueOnce(new Error("offline"))
    .mockRejectedValueOnce(new Error("offline"))
    .mockRejectedValueOnce(new Error("dns"))
    .mockResolvedValueOnce(controller);
  const result = bootstrapLocalModelBridge(
    factory,
    new AbortController().signal,
    { report, random: () => 0 },
  );
  await vi.advanceTimersByTimeAsync(60_000);
  expect(await result).toBe(controller);
  expect(factory).toHaveBeenCalledTimes(5);
  expect(report.mock.calls.map(([e]) => (e as Error).message)).toEqual([
    "offline",
    "dns",
  ]);
});
