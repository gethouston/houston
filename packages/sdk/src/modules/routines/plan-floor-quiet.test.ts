import { describe, expect, it } from "vitest";
import { RoutinesHttpError } from "./http";
import {
  isPlanMinIntervalRefusal,
  planMinIntervalRefusal,
} from "./plan-floor-quiet";

const body = {
  error:
    "This person's plan runs a scheduled task at most once every 15 minutes.",
  code: "plan_min_interval",
  minIntervalMinutes: 15,
};

function engineError(status: number, payload: unknown): Error {
  return Object.assign(new Error("engine error"), { status, body: payload });
}

describe("planMinIntervalRefusal: an expected state, not a bug", () => {
  it("recognizes the refusal however the transport carried it", () => {
    expect(planMinIntervalRefusal(engineError(400, body))).toEqual(body);
    expect(
      planMinIntervalRefusal(engineError(400, JSON.stringify(body))),
    ).toEqual(body);
    expect(
      planMinIntervalRefusal(new RoutinesHttpError(JSON.stringify(body), 400)),
    ).toEqual(body);
  });

  it("is null for every other failure", () => {
    expect(planMinIntervalRefusal(engineError(409, body))).toBeNull();
    expect(
      planMinIntervalRefusal(engineError(400, { error: "bad cron" })),
    ).toBeNull();
    expect(
      planMinIntervalRefusal(new RoutinesHttpError("not json", 400)),
    ).toBeNull();
    expect(planMinIntervalRefusal("plan_min_interval")).toBeNull();
    expect(planMinIntervalRefusal(undefined)).toBeNull();
  });
});

describe("isPlanMinIntervalRefusal: the quiet classifier's gate", () => {
  it("agrees with the parser on every transport shape", () => {
    const partial = { error: "too often", code: "plan_min_interval" };
    expect(isPlanMinIntervalRefusal(engineError(400, partial))).toBe(false);
    expect(planMinIntervalRefusal(engineError(400, partial))).toBeNull();
    for (const err of [
      engineError(400, body),
      engineError(400, JSON.stringify(body)),
      new RoutinesHttpError(JSON.stringify(body), 400),
    ])
      expect(isPlanMinIntervalRefusal(err)).toBe(true);
    for (const err of [
      engineError(409, body),
      engineError(400, { error: "bad cron" }),
      new RoutinesHttpError("not json", 400),
      "plan_min_interval",
    ])
      expect(isPlanMinIntervalRefusal(err)).toBe(false);
  });
});
