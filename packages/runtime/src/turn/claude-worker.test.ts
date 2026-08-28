import { expect, test, vi } from "vitest";
import {
  probeClaudeWorkerBinary,
  startClaudeWorkerBoot,
} from "./claude-worker";

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

test("boot probes and warms exactly once for a live single-use worker", async () => {
  const probe = vi.fn(() => "/app/sdk/claude");
  const warm = vi.fn(async () => undefined);
  const report = vi.fn();

  startClaudeWorkerBoot({
    profile: "single-use",
    root: "/data",
    probe,
    warm,
    report,
  });
  await vi.waitFor(() => expect(warm).toHaveBeenCalledTimes(1));

  expect(probe).toHaveBeenCalledTimes(1);
  expect(warm).toHaveBeenCalledWith("/data", "/app/sdk/claude");
  expect(report).not.toHaveBeenCalled();
});

test.each([
  "multi-turn",
  "server",
] as const)("%s boot never probes or warms Claude", async (profile) => {
  const probe = vi.fn(() => "/app/sdk/claude");
  const warm = vi.fn(async () => undefined);

  startClaudeWorkerBoot({
    profile,
    root: "/data",
    probe,
    warm,
    report: vi.fn(),
  });
  await Promise.resolve();

  expect(probe).not.toHaveBeenCalled();
  expect(warm).not.toHaveBeenCalled();
});

test("a boot warm failure is reported without rejecting boot", async () => {
  const report = vi.fn();

  expect(() =>
    startClaudeWorkerBoot({
      profile: "single-use",
      root: "/data",
      probe: () => "/app/sdk/claude",
      warm: async () => {
        throw new Error("warm failed");
      },
      report,
    }),
  ).not.toThrow();
  await vi.waitFor(() => expect(report).toHaveBeenCalledTimes(1));
});
