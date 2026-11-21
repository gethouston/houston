import { expect, test, vi } from "vitest";
import { settledWithin, withinDeadline } from "./action-deadline";
import { BrowserToolError } from "./errors";
import type { BrowserTab } from "./open-tab";
import { newSlot } from "./pool-slot";

function slotWithTab() {
  const close = vi.fn(async () => undefined);
  const slot = newSlot("/tmp/state.json");
  slot.tab = Promise.resolve({ context: { close } } as unknown as BrowserTab);
  return { slot, close };
}

test("an action inside the deadline passes through untouched", async () => {
  const { slot, close } = slotWithTab();
  await expect(
    withinDeadline(slot, Promise.resolve("done"), 1_000),
  ).resolves.toBe("done");
  expect(close).not.toHaveBeenCalled();
  expect(slot.tab).not.toBeNull();
});

test("an action's own failure is passed on, not turned into a timeout", async () => {
  const { slot } = slotWithTab();
  await expect(
    withinDeadline(slot, Promise.reject(new Error("boom")), 1_000),
  ).rejects.toThrow("boom");
});

test("a stuck action closes the slot's context and refuses with page_unresponsive", async () => {
  const { slot, close } = slotWithTab();
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  let release: (reason: Error) => void = () => undefined;
  const stuck = new Promise<string>((_, reject) => {
    release = reject;
  });
  const error = await withinDeadline(slot, stuck, 20).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(BrowserToolError);
  expect((error as BrowserToolError).code).toBe("page_unresponsive");
  expect(close).toHaveBeenCalledOnce();
  expect(slot.tab).toBeNull();
  release(new Error("Target closed"));
  await Promise.resolve();
  await Promise.resolve();
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
});

test("a tab whose opening is what hangs is left behind after the grace period", async () => {
  vi.useFakeTimers();
  const slot = newSlot("/tmp/state.json");
  slot.tab = new Promise<BrowserTab>(() => undefined);
  const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const result = withinDeadline(
    slot,
    new Promise<never>(() => undefined),
    1_000,
  ).catch((e: unknown) => e);
  await vi.advanceTimersByTimeAsync(1_000 + 10_000);
  expect((await result) as BrowserToolError).toMatchObject({
    code: "page_unresponsive",
  });
  expect(err).toHaveBeenCalledWith(
    "[browser] closing a stuck context did not finish; left behind",
  );
  err.mockRestore();
  warn.mockRestore();
  vi.useRealTimers();
});

test("settledWithin is true only when the step succeeds", async () => {
  const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
  await expect(settledWithin(Promise.resolve(), 50, "a step")).resolves.toBe(
    true,
  );
  await expect(
    settledWithin(Promise.reject(new Error("no")), 50, "a step"),
  ).resolves.toBe(false);
  await expect(
    settledWithin(new Promise(() => undefined), 20, "a step"),
  ).resolves.toBe(false);
  expect(err).toHaveBeenCalledWith(
    "[browser] a step did not finish; left behind",
  );
  err.mockRestore();
});
