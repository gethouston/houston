import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

process.env.HOUSTON_DATA_DIR = mkdtempSync(
  join(tmpdir(), "houston-chat-anthropic-"),
);
process.env.HOUSTON_WORKSPACE_DIR = process.env.HOUSTON_DATA_DIR;

const signal = vi.hoisted(() => ({
  settled: undefined as boolean | undefined,
}));
vi.mock("../backends/claude/credential-status", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../backends/claude/credential-status")
  >()),
  anthropicCredentialCached: () => false,
  anthropicCredentialSettled: async () => signal.settled,
}));

vi.mock("../ai/providers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../ai/providers")>()),
  resolveModel: () => {
    throw new Error("execution path reached");
  },
}));

const { config } = await import("../config");
const { runTurn } = await import("./chat");
const { getHistory } = await import("../store/conversations");

let previousControlPlaneUrl: string;
let previousSandboxToken: string;

beforeEach(() => {
  previousControlPlaneUrl = config.controlPlaneUrl;
  previousSandboxToken = config.sandboxToken;
  config.controlPlaneUrl = "https://control.test";
  config.sandboxToken = "sandbox-token";
  signal.settled = undefined;
});

afterEach(() => {
  config.controlPlaneUrl = previousControlPlaneUrl;
  config.sandboxToken = previousSandboxToken;
});

test("a cold signal that settles CONNECTED delivers the anthropic-pinned turn", async () => {
  signal.settled = true;

  await runTurn("cold-connected", "finish the task", undefined, {
    provider: "anthropic",
  });

  expect(
    getHistory("cold-connected")?.messages.at(-1)?.providerError,
  ).toMatchObject({ kind: "unknown", raw_excerpt: "execution path reached" });
});

test("a cold signal that never ANSWERS still delivers the turn (unknown is not logged out)", async () => {
  await runTurn("cold-unknown", "finish the task", undefined, {
    provider: "anthropic",
  });

  expect(
    getHistory("cold-unknown")?.messages.at(-1)?.providerError,
  ).toMatchObject({ kind: "unknown", raw_excerpt: "execution path reached" });
});

test("a SETTLED logged-out signal still refuses, with the prompt on the record", async () => {
  signal.settled = false;

  await runTurn("settled-out", "finish the task", undefined, {
    provider: "anthropic",
  });

  expect(
    getHistory("settled-out")?.messages.at(-1)?.providerError,
  ).toMatchObject({
    kind: "unauthenticated",
    provider: "anthropic",
    cause: "no_credentials",
    undelivered_prompt: "finish the task",
  });
});
