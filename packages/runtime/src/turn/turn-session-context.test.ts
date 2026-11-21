import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import type { HarnessBackend, HarnessSession } from "../backends/types";
import { currentConversationId } from "../session/conversation-context";
import { currentTurnMode } from "../session/turn-mode-context";
import { currentTurnModel } from "../session/turn-model-context";
import { runTurn } from "./turn-session";

vi.mock("./turn-runtime", () => ({
  createTurnModelRuntime: async () => ({
    modelRuntime: {},
    model: {
      provider: "openai-codex",
      id: "gpt-5.5",
      contextWindow: 200_000,
      reasoning: true,
    },
  }),
}));

test("the pooled prompt sees its conversation, mode and resolved model", async () => {
  const turnRoot = await mkdtemp(join(tmpdir(), "turn-context-"));
  const workspaceDir = join(turnRoot, "store", "workspace");
  const dataDir = join(turnRoot, "store", "data");
  await Promise.all([
    mkdir(workspaceDir, { recursive: true }),
    mkdir(dataDir, { recursive: true }),
  ]);
  const seen: unknown[] = [];
  const liveMode: import("../session/turn-mode-context").TurnModeRef = {
    current: "auto",
  };
  const backend: HarnessBackend = {
    id: "pi",
    async createSession() {
      return {
        subscribe: () => () => undefined,
        prompt: async () => {
          seen.push({
            conversation: currentConversationId(),
            mode: currentTurnMode(),
            model: currentTurnModel(),
          });
          liveMode.current = "plan";
          await Promise.resolve();
          seen.push({
            conversation: currentConversationId(),
            mode: currentTurnMode(),
            model: currentTurnModel(),
          });
        },
        abort: async () => undefined,
        dispose: () => undefined,
        setModel: async () => undefined,
        compact: async () => undefined,
        setThinkingLevel: () => undefined,
        getContextUsage: () => undefined,
      } satisfies HarnessSession;
    },
  };
  await runTurn(
    { turnRoot, workspaceDir, dataDir },
    {
      conversationId: "assistant",
      text: "hello",
      provider: "openai-codex",
      mode: "auto",
      liveMode,
      emit: () => undefined,
      signal: undefined,
      turnId: "t1",
    },
    { createBackend: () => backend },
  );
  expect(seen).toEqual([
    {
      conversation: "assistant",
      mode: "auto",
      model: { provider: "openai-codex", model: "gpt-5.5" },
    },
    {
      conversation: "assistant",
      mode: "plan",
      model: { provider: "openai-codex", model: "gpt-5.5" },
    },
  ]);
});
