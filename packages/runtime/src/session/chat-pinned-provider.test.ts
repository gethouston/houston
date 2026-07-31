import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

process.env.HOUSTON_DATA_DIR = mkdtempSync(
  join(tmpdir(), "houston-chat-pinned-"),
);
process.env.HOUSTON_WORKSPACE_DIR = process.env.HOUSTON_DATA_DIR;

const providerState = vi.hoisted(() => ({ configured: false }));
vi.mock("../ai/providers", async (importOriginal) => {
  const real = await importOriginal<typeof import("../ai/providers")>();
  return {
    ...real,
    providerConfigured: () => providerState.configured,
    resolveModel: () => {
      throw new Error("execution path reached");
    },
  };
});

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
  providerState.configured = false;
});

afterEach(() => {
  config.controlPlaneUrl = previousControlPlaneUrl;
  config.sandboxToken = previousSandboxToken;
});

test("serve mode refuses an absent pinned provider with no_credentials", async () => {
  await runTurn("pinned-absent", "finish the task", undefined, {
    provider: "openai",
  });

  expect(
    getHistory("pinned-absent")?.messages.at(-1)?.providerError,
  ).toMatchObject({
    kind: "unauthenticated",
    provider: "openai-codex",
    cause: "no_credentials",
    undelivered_prompt: "finish the task",
  });
});

test("serve mode lets a configured pinned provider reach execution", async () => {
  providerState.configured = true;

  await runTurn("pinned-configured", "finish the task", undefined, {
    provider: "openai",
  });

  expect(
    getHistory("pinned-configured")?.messages.at(-1)?.providerError,
  ).toMatchObject({
    kind: "unknown",
    raw_excerpt: "execution path reached",
  });
});

test("outside serve mode preserves the disconnected pin bypass", async () => {
  config.controlPlaneUrl = "";
  config.sandboxToken = "";

  await runTurn("pinned-local", "finish the task", undefined, {
    provider: "openai",
  });

  expect(
    getHistory("pinned-local")?.messages.at(-1)?.providerError,
  ).toMatchObject({
    kind: "unknown",
    raw_excerpt: "execution path reached",
  });
});
