import { describe, expect, it } from "vitest";
import { posixGlob } from "../build/collect.mjs";

describe("posixGlob (Windows source-glob normalisation)", () => {
  it("strips the backslashes a Windows path.join introduces", () => {
    const glob = posixGlob(
      "C:\\repo\\design-tokens",
      "tokens/primitive/**/*.json",
    );
    expect(glob.includes("\\")).toBe(false);
    expect(glob).toBe("C:/repo/design-tokens/tokens/primitive/**/*.json");
  });

  it("normalises an already-backslashed relative segment too", () => {
    expect(posixGlob("C:\\a", "tokens\\scale\\**\\*.json")).toBe(
      "C:/a/tokens/scale/**/*.json",
    );
  });

  it("leaves a POSIX glob unchanged (no-op on macOS/Linux)", () => {
    const glob = "/repo/design-tokens/tokens/semantic/color.dark.json";
    expect(posixGlob(glob)).toBe(glob);
  });
});
