import { describe, expect, it } from "vitest";
import { ClaudeBackendUnavailableError } from "./backend";
import { isBunCompiled, resolveClaudeExecutable } from "./binary-path";

describe("isBunCompiled", () => {
  it("is false for a normal Node file:// module url", () => {
    expect(isBunCompiled("file:///app/packages/runtime/src/main.ts")).toBe(
      false,
    );
  });

  it("is true inside Bun's $bunfs (POSIX single-file exe)", () => {
    expect(isBunCompiled("file:///$bunfs/root/binary-path.ts")).toBe(true);
  });

  it("is true inside Bun's ~BUN root (Windows single-file exe)", () => {
    expect(isBunCompiled("file:///B:/~BUN/root/binary-path.ts")).toBe(true);
  });
});

describe("resolveClaudeExecutable", () => {
  it("returns undefined on the Node path (SDK self-resolves)", () => {
    // No override → the SDK's own require.resolve of the platform subpackage
    // must not be pre-empted.
    expect(
      resolveClaudeExecutable({
        moduleUrl: "file:///app/packages/runtime/src/backends/claude/x.ts",
        execPath: "/usr/bin/node",
        platform: "linux",
        exists: () => true,
      }),
    ).toBeUndefined();
  });

  it("resolves the sibling `claude` next to the sidecar under Bun-compiled", () => {
    const seen: string[] = [];
    const path = resolveClaudeExecutable({
      moduleUrl: "file:///$bunfs/root/backends/claude/binary-path.ts",
      execPath: "/Applications/Houston.app/Contents/MacOS/houston-engine",
      platform: "darwin",
      exists: (p) => {
        seen.push(p);
        return true;
      },
    });
    expect(path).toBe("/Applications/Houston.app/Contents/MacOS/claude");
    expect(seen).toEqual(["/Applications/Houston.app/Contents/MacOS/claude"]);
  });

  it("uses claude.exe on win32", () => {
    const path = resolveClaudeExecutable({
      moduleUrl: "file:///B:/~BUN/root/binary-path.ts",
      execPath: "C:\\Program Files\\Houston\\houston-engine.exe",
      platform: "win32",
      exists: () => true,
    });
    expect(path?.endsWith("claude.exe")).toBe(true);
  });

  it("throws a typed ClaudeBackendUnavailableError when the sibling is missing", () => {
    expect(() =>
      resolveClaudeExecutable({
        moduleUrl: "file:///$bunfs/root/binary-path.ts",
        execPath: "/Applications/Houston.app/Contents/MacOS/houston-engine",
        platform: "darwin",
        exists: () => false,
      }),
    ).toThrow(ClaudeBackendUnavailableError);
  });
});
