import { describe, expect, it } from "vitest";
import { color, durationMs, easing, radius, space } from "../dist/ts/tokens.ts";

/**
 * Smoke test: the generated TypeScript entry point is importable, typed, and
 * carries the values downstream JS relies on (e.g. motion durations).
 */
describe("generated TypeScript tokens", () => {
  it("exposes both themes with the same colour keys", () => {
    expect(Object.keys(color.light)).toEqual(Object.keys(color.dark));
    expect(color.light.background).toBe("#ffffff");
    expect(color.dark.background).toBe("#1e1e1e");
  });

  it("exposes numeric motion durations for JS animation", () => {
    expect(durationMs.fast).toBe(200);
    expect(easing.standard).toEqual([0.25, 0.1, 0.25, 1]);
  });

  it("exposes scale tokens", () => {
    expect(space["16"]).toBe("16px");
    expect(radius.composer).toBe("28px");
  });
});
