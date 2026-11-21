import { afterEach, expect, test, vi } from "vitest";
import {
  TurnDeliveryUncertainError,
  TurnFireError,
  turnBusyError,
} from "../channel/fire-error";
import { LauncherClosedError } from "../ports";
import {
  decodeFireOutcome,
  encodeFireOutcome,
  FIRE_IN_FLIGHT,
  isRetryableFireError,
  reportUnfiredFire,
  unfiredOutcome,
} from "./fire-outcome";
import { RoutineBusyError, RoutineRunUnrecordedError } from "./run";

test("an outcome round-trips through the lock value", () => {
  for (const outcome of [
    { result: "fired", startedAt: "2026-06-12T14:00:01.000Z" },
    { result: "busy" },
    { result: "failed", code: "no_provider", error: "runtime 409" },
    { result: "failed", code: null, error: "boom" },
  ] as const)
    expect(decodeFireOutcome(encodeFireOutcome(outcome))).toEqual(outcome);
});

test("a fresh burn reads as in flight, never as an outcome", () => {
  expect(decodeFireOutcome(FIRE_IN_FLIGHT)).toEqual({ result: "pending" });
});

test("a burn with no recorded outcome replays nothing", () => {
  for (const value of [null, "", "1", "not json", '{"result":"weird"}'])
    expect(decodeFireOutcome(value)).toBeNull();
});

test("a recorded failure reason is bounded", () => {
  const value = encodeFireOutcome({
    result: "failed",
    code: null,
    error: "x".repeat(5000),
  });
  const decoded = decodeFireOutcome(value);
  expect(decoded?.result === "failed" && decoded.error.length).toBe(1000);
});

test("only where-it-ran failures are retryable", () => {
  expect(isRetryableFireError(new LauncherClosedError())).toBe(true);
  expect(isRetryableFireError(new TypeError("fetch failed"))).toBe(true);
  expect(
    isRetryableFireError(new RoutineRunUnrecordedError(new Error("x"))),
  ).toBe(true);
  expect(isRetryableFireError(new TypeError("x is not a function"))).toBe(
    false,
  );
  expect(
    isRetryableFireError(new TurnFireError("runtime 409", 409, null)),
  ).toBe(false);
});

const reset = () =>
  Object.assign(new TypeError("fetch failed"), {
    cause: { code: "ECONNRESET" },
  });

test("a lost turn POST is retryable only once the host's drain stopped the runtime", () => {
  expect(isRetryableFireError(new TurnDeliveryUncertainError(reset()))).toBe(
    false,
  );
  const drained = new TurnDeliveryUncertainError(reset(), true);
  expect(isRetryableFireError(drained)).toBe(true);
  expect(drained.message).not.toContain("may have started");
});

test("a runtime refusing new turns while it drains is retryable", () => {
  const draining = new TurnFireError(
    'runtime 503: {"error":"engine unavailable","detail":"the agent is restarting"}',
    503,
    null,
  );
  expect(isRetryableFireError(draining)).toBe(true);
  expect(
    isRetryableFireError(new TurnFireError("runtime 502: bad", 502, null)),
  ).toBe(false);
});

afterEach(() => vi.restoreAllMocks());

test.each([
  ["an unexpected throw", "error", new Error("boom"), false],
  [
    "a runtime 5xx",
    "error",
    new TurnFireError("runtime 500: x", 500, null),
    false,
  ],
  ["a lost turn POST", "error", new TurnDeliveryUncertainError(reset()), false],
  [
    "a creator with nothing connected",
    "warn",
    new TurnFireError("runtime 409", 409, "no_provider"),
    false,
  ],
  ["a taken turn slot", "warn", turnBusyError(null), false],
  ["a busy routine", "warn", new RoutineBusyError("r"), false],
  ["a draining host", "warn", new LauncherClosedError(), true],
  [
    "a lost turn POST during the drain",
    "warn",
    new TurnDeliveryUncertainError(reset(), true),
    true,
  ],
  [
    "an unrecorded run",
    "error",
    new RoutineRunUnrecordedError(new Error("disk full")),
    true,
  ],
] as const)("%s is reported at %s level", (_name, level, error, deferred) => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const err = vi.spyOn(console, "error").mockImplementation(() => {});
  reportUnfiredFire("r1", error, deferred);
  const [used, unused] = level === "error" ? [err, warn] : [warn, err];
  expect(used).toHaveBeenCalledTimes(1);
  expect(String(used.mock.calls[0]?.[0])).toContain(
    "[routine-fires] routine r1",
  );
  expect(unused).not.toHaveBeenCalled();
});

test("busy refusals are busy, everything else failed with its code", () => {
  expect(unfiredOutcome(new RoutineBusyError("r"))).toEqual({ result: "busy" });
  expect(unfiredOutcome(turnBusyError(null))).toEqual({ result: "busy" });
  expect(
    unfiredOutcome(new TurnFireError("runtime 409", 409, "no_provider")),
  ).toEqual({ result: "failed", code: "no_provider", error: "runtime 409" });
  expect(unfiredOutcome("raw")).toEqual({
    result: "failed",
    code: null,
    error: "raw",
  });
});
