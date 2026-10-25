import { EngineError } from "@houston/runtime-client";
import { afterEach, expect, test, vi } from "vitest";
import {
  observerSettled,
  sendHolding,
  type TurnEndEvidence,
} from "./send-hold";
import { type ActiveStream, StreamRegistry } from "./stream-registry";

afterEach(() => vi.useRealTimers());

test("a follow-up stays pending past fifteen minutes of running refusals and sends as soon as the turn ends", async () => {
  vi.useFakeTimers();
  let running = true;
  let wake: () => void = () => {};
  const evidence: TurnEndEvidence = {
    turnEnds: 0,
    get lastProgressAt() {
      return Date.now();
    },
    turnEndAfter: (_mark, signal) =>
      new Promise((resolve) => {
        wake = () => resolve();
        signal.addEventListener("abort", () => resolve(), { once: true });
      }),
  };
  const send = vi.fn(async () => {
    if (running) throw new EngineError(409, '{"error":"turn running"}');
    return { turnId: "next" };
  });
  let settled = false;
  const result = sendHolding(
    send,
    evidence,
    new AbortController().signal,
    undefined,
    { onHold: () => {} },
  ).then(
    (value) => {
      settled = true;
      return value;
    },
    (error) => {
      settled = true;
      throw error;
    },
  );
  // Attach immediately so the intentional red run also captures a rejection.
  const observed = result.catch((error) => error);
  await vi.advanceTimersByTimeAsync(16 * 60_000);
  expect(settled).toBe(false);
  running = false;
  wake();
  await expect(observed).resolves.toEqual({ turnId: "next" });
});

test("an observer handoff stays pending with live progress past fifteen minutes and releases when the turn finishes", async () => {
  vi.useFakeTimers();
  const registry = new StreamRegistry();
  const observer: ActiveStream = { kind: "observer", dispose: () => {} };
  Object.defineProperty(observer, "lastProgressAt", { get: () => Date.now() });
  registry.set("key", observer);
  let settled = false;
  const result = observerSettled(registry, "key", observer, undefined).then(
    (value) => {
      settled = true;
      return value;
    },
  );
  await vi.advanceTimersByTimeAsync(16 * 60_000);
  expect(settled).toBe(false);
  // Both terminal progress and the existing dead-stream evidence remove it.
  registry.release("key", observer);
  await expect(result).resolves.toBe(true);
});

test("a stuck observer cannot hold a send beyond the four-hour ceiling plus five minutes", async () => {
  vi.useFakeTimers();
  const registry = new StreamRegistry();
  const observer: ActiveStream = { kind: "observer", dispose: () => {} };
  Object.defineProperty(observer, "lastProgressAt", { get: () => Date.now() });
  registry.set("key", observer);
  let settled = false;
  const result = observerSettled(registry, "key", observer, undefined).then(
    (value) => {
      settled = true;
      return value;
    },
  );
  await vi.advanceTimersByTimeAsync(4 * 60 * 60_000);
  expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(5 * 60_000);
  await expect(result).resolves.toBe(false);
});

test("a persistent 409 without live progress retains the fifteen-minute hold", async () => {
  vi.useFakeTimers();
  const refusal = new EngineError(409, '{"error":"turn running"}');
  const result = sendHolding(
    async () => {
      throw refusal;
    },
    {
      turnEnds: 0,
      turnEndAfter: (_mark, signal) =>
        new Promise((resolve) =>
          signal.addEventListener("abort", () => resolve(), { once: true }),
        ),
    },
    new AbortController().signal,
    undefined,
    { onHold: () => {} },
  ).catch((error) => error);
  let ended = false;
  void result.then(() => {
    ended = true;
  });
  await vi.advanceTimersByTimeAsync(15 * 60_000 - 1);
  expect(ended).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(ended).toBe(true);
  await expect(result).resolves.toBe(refusal);
});

test("an observer with no progress retains the fifteen-minute hold", async () => {
  vi.useFakeTimers();
  const registry = new StreamRegistry();
  const observer: ActiveStream = { kind: "observer", dispose: () => {} };
  registry.set("key", observer);
  const result = observerSettled(registry, "key", observer, undefined);
  let ended = false;
  void result.then(() => {
    ended = true;
  });
  await vi.advanceTimersByTimeAsync(15 * 60_000 - 1);
  expect(ended).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(ended).toBe(true);
  await expect(result).resolves.toBe(false);
});
