import { describe, expect, test } from "vitest";
import { parseTurnModePin } from "./conversation";

describe("parseTurnModePin", () => {
  test("a send that names no mode pins none", () => {
    expect(parseTurnModePin(undefined)).toBeUndefined();
    expect(parseTurnModePin(null)).toBeUndefined();
    expect(parseTurnModePin("")).toBeUndefined();
  });

  test("a known mode passes and garbage is the default, never a surprise", () => {
    expect(parseTurnModePin("plan")).toBe("plan");
    expect(parseTurnModePin("auto")).toBe("auto");
    expect(parseTurnModePin("Autopilot")).toBe("execute");
    expect(parseTurnModePin(7)).toBe("execute");
  });
});
