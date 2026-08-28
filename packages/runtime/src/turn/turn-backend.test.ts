import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import { writeAuthFile } from "../auth/auth-file";
import { createTurnBackend, type TurnBackendDeps } from "./turn-backend";
import type { TurnSessionRequest } from "./turn-session";

function deps(credential: "oauth" | "api_key"): TurnBackendDeps {
  const turnRoot = mkdtempSync(join(tmpdir(), "turn-backend-"));
  const workspaceDir = join(turnRoot, "store", "workspace");
  const dataDir = join(turnRoot, "store", "data");
  mkdirSync(workspaceDir, { recursive: true });
  mkdirSync(dataDir, { recursive: true });
  writeAuthFile(join(dataDir, "auth.json"), {
    anthropic:
      credential === "oauth"
        ? {
            type: "oauth",
            access: "sk-ant-oat01-test",
            refresh: "",
            expires: Date.now() + 60_000,
          }
        : { type: "api_key", key: "sk-ant-api03-test" },
  });
  const turn: TurnSessionRequest = {
    conversationId: "c1",
    text: "hello",
    provider: "anthropic",
    emit: () => undefined,
    signal: undefined,
    turnId: "t1",
  };
  return {
    directories: { workspaceDir, dataDir, turnRoot },
    turn,
    modelRuntime: {} as ModelRuntime,
    toolSelection: { toolNames: [], includeRunCode: false },
    codeSandbox: null,
    systemPrompt: "system",
  };
}

test.each([
  "oauth",
  "api_key",
] as const)("anthropic uses the Claude backend for a %s credential", (credential) => {
  expect(createTurnBackend("anthropic", deps(credential)).id).toBe("anthropic");
});

test.each([
  "openai-codex",
  "google",
  "openrouter",
])("%s uses the pi backend", (provider) => {
  expect(createTurnBackend(provider, deps("oauth")).id).toBe("pi");
});

test("an unavailable Claude SDK becomes a typed provider failure", async () => {
  const input = deps("oauth");
  input.claudeSdk = {
    query: async function* () {},
    createSdkMcpServer: (() => {
      throw new Error("SDK binary missing");
    }) as typeof createSdkMcpServer,
  };
  const backend = createTurnBackend("anthropic", input);

  await expect(
    backend.createSession({
      conversationId: "c1",
      model: {
        provider: "anthropic",
        id: "claude-sonnet-4-6",
        contextWindow: 200_000,
      },
    }),
  ).rejects.toMatchObject({
    providerError: {
      kind: "provider_internal",
      provider: "anthropic",
      message: "Claude Agent SDK is unavailable in this worker.",
    },
  });
});
