import { parsePlanMinIntervalRefusal as protocolParse } from "@houston/protocol/plan-min-interval";
import { expect, test } from "vitest";
import { PLAN_MIN_INTERVAL, parsePlanMinIntervalRefusal } from "./plan";

test("the wire contract re-exports the protocol's one parser", () => {
  expect(parsePlanMinIntervalRefusal).toBe(protocolParse);
  expect(PLAN_MIN_INTERVAL).toBe("plan_min_interval");
});
