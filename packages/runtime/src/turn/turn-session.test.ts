import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  createSdkMcpServer,
  Options,
  SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { beforeEach, expect, test, vi } from "vitest";
import { writeAuthFile } from "../auth/auth-file";
import type { ClaudeQuery } from "../backends/claude/session";
import {
  appendAssistantMessageAt,
  appendUserMessageAt,
} from "../store/conversation-file";
import { turnClaudeLayout } from "./turn-backend";
import { runTurn, type TurnDirectories } from "./turn-session";

vi.mock("./turn-runtime", () => ({
  createTurnModelRuntime: async () => ({
    modelRuntime: {},
    model: {
      provider: "anthropic",
      id: "claude-sonnet-4-6",
      contextWindow: 200_000,
      reasoning: true,
    },
  }),
}));

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

async function directories(): Promise<TurnDirectories> {
  const turnRoot = await mkdtemp(join(tmpdir(), "claude-turn-session-"));
  const workspaceDir = join(turnRoot, "store", "workspace");
  const dataDir = join(turnRoot, "store", "data");
  await Promise.all([
    mkdir(workspaceDir, { recursive: true }),
    mkdir(dataDir, { recursive: true }),
  ]);
  writeAuthFile(join(dataDir, "auth.json"), {
    anthropic: {
      type: "oauth",
      access: "sk-ant-oat01-test",
      refresh: "",
      expires: Date.now() + 60_000,
    },
  });
  return { turnRoot, workspaceDir, dataDir };
}

function sdk(query: ClaudeQuery) {
  const makeMcp = ((input: { name: string }) => ({
    type: "sdk",
    name: input.name,
    instance: {},
  })) as typeof createSdkMcpServer;
  return { query, createSdkMcpServer: makeMcp };
}

function scriptedQuery(capture: (prompt: string, options: Options) => void) {
  const query: ClaudeQuery = async function* ({ prompt, options }) {
    capture(prompt, options);
    yield {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "reply" },
      },
      session_id: "session-next",
      parent_tool_use_id: null,
    } as unknown as SDKMessage;
    yield {
      type: "result",
      subtype: "success",
      usage: { input_tokens: 10, output_tokens: 2 },
      session_id: "session-next",
    } as unknown as SDKMessage;
  };
  return query;
}

function seedConversation(dataDir: string): void {
  const conversationsDir = join(dataDir, "conversations");
  appendUserMessageAt(conversationsDir, "c1", "Remember the blue lantern.", {
    turnId: "prior-user",
  });
  appendAssistantMessageAt(conversationsDir, "c1", "I will remember it.", {
    turnId: "prior-assistant",
  });
}

test("relocates a hydrated foreign-slug transcript and resumes without replay", async () => {
  const dirs = await directories();
  const layout = turnClaudeLayout(dirs.turnRoot, dirs.dataDir, "c1");
  seedConversation(dirs.dataDir);
  await mkdir(join(layout.configDir, "projects", "foreign-slug"), {
    recursive: true,
  });
  await writeFile(
    join(layout.configDir, "projects", "foreign-slug", "session-old.jsonl"),
    "{}\n",
  );
  await writeFile(layout.sessionsFile, JSON.stringify({ c1: "session-old" }));
  let captured: { prompt: string; options: Options } | undefined;

  await runTurn(
    dirs,
    {
      conversationId: "c1",
      text: "What did I ask you to remember?",
      provider: "anthropic",
      emit: () => undefined,
      signal: undefined,
      turnId: "current",
    },
    {
      claudeSdk: sdk(
        scriptedQuery((prompt, options) => {
          captured = { prompt, options };
        }),
      ),
    },
  );

  expect(captured?.options.resume).toBe("session-old");
  expect(captured?.prompt).not.toContain(
    "[Continuing an existing conversation.",
  );
  const slug = dirs.workspaceDir.replace(/[^A-Za-z0-9]/g, "-");
  await expect(
    stat(join(layout.configDir, "projects", slug, "session-old.jsonl")),
  ).resolves.toBeDefined();
});

test("a missing transcript starts fresh with the canonical replay preamble", async () => {
  const dirs = await directories();
  const layout = turnClaudeLayout(dirs.turnRoot, dirs.dataDir, "c1");
  seedConversation(dirs.dataDir);
  await mkdir(layout.configDir, { recursive: true });
  await writeFile(layout.sessionsFile, JSON.stringify({ c1: "missing" }));
  let captured: { prompt: string; options: Options } | undefined;

  await runTurn(
    dirs,
    {
      conversationId: "c1",
      text: "What did I ask you to remember?",
      provider: "anthropic",
      emit: () => undefined,
      signal: undefined,
      turnId: "current",
    },
    {
      claudeSdk: sdk(
        scriptedQuery((prompt, options) => {
          captured = { prompt, options };
        }),
      ),
    },
  );

  expect(captured?.options.resume).toBeUndefined();
  expect(captured?.prompt).toContain("[Continuing an existing conversation.");
  expect(captured?.prompt).toContain("User: Remember the blue lantern.");
  expect(captured?.prompt).toContain("Assistant: I will remember it.");
  expect(captured?.prompt).toContain("What did I ask you to remember?");
});
