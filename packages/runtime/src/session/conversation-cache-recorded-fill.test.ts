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
 * A session the standing server builds for a conversation that already ran
 * (after a restart, or an eviction) is told the fill its last reply recorded:
 * the Claude backend only measures its own after a turn, and sizes its first
 * request's first-byte deadline from this.
 */

process.env.HOUSTON_DATA_DIR = mkdtempSync(join(tmpdir(), "houston-fill-"));
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
const { setDefaultBackend } = await import("../backends/registry");
const { appendAssistantMessage, appendUserMessage } = await import(
  "../store/conversations"
);

function recordingBackend(created: CreateSessionOptions[]): HarnessBackend {
  return {
    id: "pi",
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

test("a rebuilt session reads the fill its conversation's last reply recorded", async () => {
  modelState.model = {
    provider: "openai-codex",
    id: "gpt-5-codex",
    contextWindow: 400_000,
  };
  const created: CreateSessionOptions[] = [];
  setDefaultBackend(recordingBackend(created));
  appendUserMessage("long", "Read the whole archive.");
  appendAssistantMessage("long", "Done.", {
    usage: { context_tokens: 812_345, output_tokens: 10, cached_tokens: 0 },
  });

  await getConversation("long");
  await getConversation("new");

  expect(created.map((opts) => opts.recordedContextTokens?.())).toEqual([
    812_345,
    undefined,
  ]);
});
