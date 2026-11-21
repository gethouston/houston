import {
  PLAN_MIN_INTERVAL,
  parsePlanMinIntervalRefusal,
} from "@houston/protocol/plan-min-interval";
import { describe, expect, it } from "vitest";
import { planFloorRefusal } from "./routine-write-gates";

const overTheWire = (body: unknown): unknown =>
  JSON.parse(JSON.stringify(body));

describe("the host's plan-floor refusal parses as the client reads it", () => {
  for (const [name, kept] of [
    ["a new or changed schedule", false],
    ["a kept fast schedule", true],
  ] as const)
    it(`for ${name}, at any floor`, () => {
      for (const floor of [15, 30, 60]) {
        const refusal = planFloorRefusal("*/5 * * * *", floor, kept);
        expect(refusal).not.toBeNull();
        expect(parsePlanMinIntervalRefusal(overTheWire(refusal))).toEqual({
          error: refusal?.error,
          code: PLAN_MIN_INTERVAL,
          minIntervalMinutes: floor,
        });
      }
    });
});
