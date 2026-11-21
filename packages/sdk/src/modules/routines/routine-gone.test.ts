import { describe, expect, it } from "vitest";
import { RoutinesHttpError } from "./http";
import { isRoutineGone } from "./routine-gone";

function engineError(status: number, payload: unknown): Error {
  return Object.assign(new Error("engine error"), { status, body: payload });
}

const typed = { error: "routine not found", code: "routine_not_found" };
const legacy = { error: "routine not found" };

describe("isRoutineGone: a routine write's typed 404", () => {
  it("recognizes the refusal however the transport carried it", () => {
    for (const err of [
      engineError(404, typed),
      engineError(404, legacy),
      engineError(404, JSON.stringify(typed)),
      new RoutinesHttpError(JSON.stringify(typed), 404),
      new RoutinesHttpError(JSON.stringify(legacy), 404),
    ])
      expect(isRoutineGone(err)).toBe(true);
  });

  it("is false for every other failure", () => {
    for (const err of [
      engineError(404, { error: "agent not found" }),
      engineError(404, { error: "run not found" }),
      engineError(409, typed),
      new RoutinesHttpError(JSON.stringify({ error: "agent not found" }), 404),
      new RoutinesHttpError("not json", 404),
      "routine not found",
      undefined,
    ])
      expect(isRoutineGone(err)).toBe(false);
  });
});
