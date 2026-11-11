import { describe, expect, test } from "vitest";
import { isMissionStarter } from "./mission-starter";

describe("isMissionStarter", () => {
  test.each(["houston", "employee", "api"])("accepts %s", (starter) => {
    expect(isMissionStarter(starter)).toBe(true);
  });

  test.each([
    "person",
    "Houston",
    "",
    undefined,
    null,
    1,
    {},
  ])("rejects %j", (value) => {
    expect(isMissionStarter(value)).toBe(false);
  });
});
