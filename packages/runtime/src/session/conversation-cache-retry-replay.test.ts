import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import type {
  CreateSessionOptions,
  HarnessBackend,
  ResolvedModel,
} from "../backends/types";

/**
 * A Claude resume that fails mid-turn reruns the prompt as a fresh session.
 * On the standing server that rerun must open with the conversation so far,
 * or the model answers a follow-up ("Give me three more.") with no idea what
 * came before.
 */

process.env.HOUSTON_DATA_DIR = mkdtempSync(join(tmpdir(), "houston-replay-"));
process.env.HOUSTON_WORKSPACE_DIR = mkdtempSync(join(tmpdir(), "houston-ws-"));

const modelState = vi.hoisted(() => ({ model: null as ResolvedModel | null }));
vi.mock("../ai/providers", async (importOriginal) => {
  const real = await importOriginal<typeof import("../ai/providers")>();
  return {
    ...real,
    resolveModel: () => modelState.model,
    activeEffort: () => null,
  };
});

const { getConversation, conversations } = await import("./conversation-cache");
const { registerBackend } = await import("../backends/registry");
const { appendAssistantMessage, appendUserMessage } = await import(
  "../store/conversations"
);

function recordingBackend(created: CreateSessionOptions[]): HarnessBackend {
  return {
    id: "claude",
    async createSession(opts) {
      created.push(opts);
      return {
        subscribe: () => () => undefined,
        prompt: async () => undefined,
        abort: async () => undefined,
        dispose: () => undefined,
        setModel: async () => undefined,
        compact: async () => undefined,
        setThinkingLevel: () => undefined,
        getContextUsage: () => undefined,
      };
    },
  };
}

afterEach(() => {
  conversations.clear();
});

test("a fresh rerun on the standing server opens with the conversation so far, not the turn in flight", async () => {
  modelState.model = {
    provider: "anthropic",
    id: "claude-sonnet-5-5",
    contextWindow: 200_000,
  };
  const created: CreateSessionOptions[] = [];
  registerBackend("anthropic", recordingBackend(created));
  appendUserMessage("offsite", "Give me three ideas for a team offsite.", {
    turnId: "t1",
  });
  appendAssistantMessage("offsite", "1. Site tour and build day.", {
    turnId: "t1",
  });
  // The turn in flight appends its message before it prompts.
  appendUserMessage("offsite", "Give me three more.", { turnId: "t2" });

  await getConversation("offsite");
  const replay = created[0]?.freshRetryPromptPrefix?.() ?? "";

  expect(replay).toContain("Give me three ideas for a team offsite.");
  expect(replay).toContain("Site tour and build day.");
  // The rerun sends the turn's own text after the replay; a copy inside it
  // would show the model the question twice.
  expect(replay).not.toContain("Give me three more.");
});

test("a brand-new conversation has nothing to replay", async () => {
  modelState.model = {
    provider: "anthropic",
    id: "claude-sonnet-5-5",
    contextWindow: 200_000,
  };
  const created: CreateSessionOptions[] = [];
  registerBackend("anthropic", recordingBackend(created));
  appendUserMessage("first", "Hello.", { turnId: "t1" });

  await getConversation("first");

  expect(created[0]?.freshRetryPromptPrefix?.()).toBe("");
});
