import { expect, test } from "vitest";
import { parseRoutineFloorHeader, parseTurnLimits } from "./turn-limits";

test("a valid routine floor survives", () => {
  expect(parseTurnLimits({ routineMinIntervalMinutes: 15 })).toEqual({
    routineMinIntervalMinutes: 15,
  });
  expect(parseTurnLimits({ routineMinIntervalMinutes: 1 })).toEqual({
    routineMinIntervalMinutes: 1,
  });
  expect(parseTurnLimits({ routineMinIntervalMinutes: 1440 })).toEqual({
    routineMinIntervalMinutes: 1440,
  });
});

test("unknown fields are dropped", () => {
  expect(
    parseTurnLimits({ routineMinIntervalMinutes: 15, maxActive: 1 }),
  ).toEqual({ routineMinIntervalMinutes: 15 });
});

test("anything that is not a whole number of minutes in range is no limit", () => {
  for (const floor of [0, -5, 1441, 15.5, "15", null, Number.NaN, Infinity])
    expect(
      parseTurnLimits({ routineMinIntervalMinutes: floor }),
      String(floor),
    ).toBeUndefined();
});

test("a value that is not a plain object is no limits", () => {
  for (const value of [undefined, null, 15, "limits", [], [15], {}])
    expect(parseTurnLimits(value), JSON.stringify(value)).toBeUndefined();
});

test("the routine floor header names whole minutes in range", () => {
  expect(parseRoutineFloorHeader("15")).toBe(15);
  expect(parseRoutineFloorHeader(" 30 ")).toBe(30);
  expect(parseRoutineFloorHeader(["20", "5"])).toBe(20);
});

test("an absent or garbled floor header is no floor", () => {
  for (const value of [
    undefined,
    "",
    "0",
    "1441",
    "15.5",
    "-5",
    "15m",
    "abc",
    "1, 15",
    [],
  ])
    expect(parseRoutineFloorHeader(value), String(value)).toBeUndefined();
});
