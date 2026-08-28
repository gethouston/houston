import { expect, test } from "vitest";
import { probeClaudeWorkerBinary } from "./claude-worker";

function stats(isFile: boolean): { isFile(): boolean } {
  return { isFile: () => isFile };
}

test("the worker probe returns a present SDK platform binary", () => {
  expect(
    probeClaudeWorkerBinary({
      resolveBinary: () => "/app/sdk/claude",
      stat: () => stats(true),
    }),
  ).toBe("/app/sdk/claude");
});

test("the worker probe fails loudly when the platform binary is absent", () => {
  expect(() => probeClaudeWorkerBinary({ resolveBinary: () => null })).toThrow(
    "Claude Agent SDK binary is unavailable",
  );
});

test("the worker probe rejects a non-file path", () => {
  expect(() =>
    probeClaudeWorkerBinary({
      resolveBinary: () => "/app/sdk/claude",
      stat: () => stats(false),
    }),
  ).toThrow("Claude Agent SDK binary is not a file");
});
