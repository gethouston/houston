import { afterEach, beforeEach, expect, test, vi } from "vitest";

const SHADOWED = "CLAUDE_SDK_CAN_USE_TOOL_SHADOWED";

const delivered = () => new Promise((resolve) => setImmediate(resolve));

let original: NodeJS.WarningListener[] = [];

beforeEach(() => {
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
