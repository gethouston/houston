import { describe, expect, it } from "vitest";
import { posixGlob } from "../build/collect.mjs";

/**
 * Regression for the Windows CI break: both windows-msvc release jobs failed at
 * `pnpm install` → the design-tokens `prepare` build with "Some token references
 * could not be found". Style Dictionary globs its `source` files with fast-glob,
 * which requires forward-slash separators on every platform. On Windows
 * `node:path.join` emits backslashes, which fast-glob reads as escapes, so the
 * primitive/scale globs matched nothing and every cross-file reference dangled.
 *
 * These assert the transform on a Windows-style root, so they hold on any OS
 * (macOS/Linux `path.join` never introduces backslashes, so the bug can't
 * reproduce there — the input has to be simulated). This file is .mjs so it can
 * import the .mjs build helper without tripping the package's TS typecheck.
 */
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
