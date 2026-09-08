import { afterEach, beforeEach, expect, test, vi } from "vitest";

/**
 * The SDK warns on EVERY `query()` that Houston's pre-approved MCP tools skip
 * its permission callback - which is the design, not a defect. Left alone, Node
 * printed it to stderr once per turn, where the log stamps it ERROR: dozens of
 * red lines a day saying nothing, which is how a real error learns to hide.
 */

const SHADOWED = "CLAUDE_SDK_CAN_USE_TOOL_SHADOWED";

/** `process.emitWarning` delivers on the next tick, never synchronously. */
const delivered = () => new Promise((resolve) => setImmediate(resolve));

let original: NodeJS.WarningListener[] = [];

beforeEach(() => {
  // The filter installs once per PROCESS, so each test starts from a fresh
  // module instance and a warning surface it owns entirely.
  vi.resetModules();
  original = process.listeners("warning");
  process.removeAllListeners("warning");
});

afterEach(() => {
  vi.restoreAllMocks();
  process.removeAllListeners("warning");
  for (const listener of original) process.on("warning", listener);
});

test("the per-turn notice is reported once, at INFO", async () => {
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  const { installClaudeSdkWarningFilter } = await import("./sdk-warnings");
  installClaudeSdkWarningFilter();
  // Idempotent: every session build calls it, and a second filter would stack
  // listeners and report the same warning twice.
  installClaudeSdkWarningFilter();
  for (let turn = 0; turn < 5; turn++) {
    process.emitWarning("canUseTool will not be invoked for: mcp__houston__x", {
      code: SHADOWED,
    });
  }
  await delivered();
  expect(info).toHaveBeenCalledTimes(1);
  expect(info.mock.calls[0]?.[0]).toContain("pre-approves");
});

test("every other warning still reaches the handlers Node installed", async () => {
  const seen: string[] = [];
  process.on("warning", (warning) => seen.push(warning.message));
  const { installClaudeSdkWarningFilter } = await import("./sdk-warnings");
  vi.spyOn(console, "info").mockImplementation(() => {});
  installClaudeSdkWarningFilter();
  process.emitWarning("a real deprecation", { code: "DEP0001" });
  process.emitWarning("shadowed", { code: SHADOWED });
  await delivered();
  expect(seen).toEqual(["a real deprecation"]);
});
