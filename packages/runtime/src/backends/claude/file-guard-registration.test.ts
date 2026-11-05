import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  createSdkMcpServer,
  HookJSONOutput,
  Options,
  PreToolUseHookInput,
  SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { expect, test } from "vitest";
import { writeAuthFile } from "../../auth/auth-file";
import { createCompactionCheckpoints } from "../../store/conversation-compaction";
import { createConversationStore } from "../../store/conversations";
import { createTurnBackend } from "../../turn/turn-backend";
import type { ResolvedModel } from "../types";
import { createClaudeBackend } from "./backend";
import { oneShotWithClaude } from "./one-shot";
import { serverClaudeLayout } from "./paths";
import type { ClaudeSdk } from "./sdk-loader";
import { type ClaudeQuery, ClaudeSession } from "./session";

/**
 * Every path that builds a Claude query carries the workspace guard as a
 * PreToolUse hook: Claude Code auto-approves reads inside `cwd` without asking
 * `canUseTool`, so every query this backend builds must carry the hook.
 * Each kind is built through its real entry point and its options captured.
 */

const MODEL: ResolvedModel = {
  provider: "anthropic",
  id: "claude-sonnet-4-6",
  contextWindow: 200_000,
};

function reply(sessionId: string): SDKMessage[] {
  return [
    {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: "a summary" },
      },
      session_id: sessionId,
      parent_tool_use_id: null,
    },
    {
      type: "result",
      subtype: "success",
      usage: { input_tokens: 10, output_tokens: 2, cache_read_input_tokens: 0 },
      session_id: sessionId,
    },
  ] as unknown as SDKMessage[];
}

function capturingSdk(): { sdk: ClaudeSdk; calls: Options[] } {
  const calls: Options[] = [];
  const query: ClaudeQuery = (params) => {
    calls.push(params.options);
    return (async function* () {
      yield* reply("sdk-session-1");
    })();
  };
  const createServer = ((opts: { name: string }) => ({
    type: "sdk",
    name: opts.name,
    instance: {},
  })) as unknown as typeof createSdkMcpServer;
  return { sdk: { query, createSdkMcpServer: createServer }, calls };
}

/** A workspace with the runtime's data dir inside it, as in production. */
function workspace(): { workspaceDir: string; dataDir: string } {
  const workspaceDir = realpathSync(mkdtempSync(join(tmpdir(), "guard-reg-")));
  const dataDir = join(workspaceDir, ".houston", "runtime");
  mkdirSync(join(dataDir, "auth-users"), { recursive: true });
  writeAuthFile(join(dataDir, "auth.json"), {
    anthropic: { type: "api_key", key: "sk-ant-api03-test" },
  });
  writeFileSync(join(workspaceDir, "notes.md"), "notes");
  return { workspaceDir, dataDir };
}

async function preToolUse(
  options: Options | undefined,
  file_path: string,
): Promise<HookJSONOutput> {
  const hook = options?.hooks?.PreToolUse?.[0]?.hooks[0];
  if (!hook) throw new Error("the query carries no PreToolUse hook");
  const input = {
    hook_event_name: "PreToolUse",
    tool_name: "Read",
    tool_input: { file_path },
    tool_use_id: "t",
    session_id: "s",
    transcript_path: "/dev/null",
    cwd: "/",
  } as PreToolUseHookInput;
  return hook(input, "t", { signal: new AbortController().signal });
}

async function expectGuarded(options: Options | undefined): Promise<void> {
  expect(await preToolUse(options, ".houston/runtime/auth.json")).toMatchObject(
    { hookSpecificOutput: { permissionDecision: "deny" } },
  );
  expect(await preToolUse(options, "notes.md")).toMatchObject({
    hookSpecificOutput: { updatedInput: { file_path: expect.any(String) } },
  });
  expect(options?.disallowedTools).toContain("Read(**/auth.json)");
  expect(options?.canUseTool).toBeTypeOf("function");
  // An `@path` in the prompt would attach the file with no tool call at all.
  expect(options?.env?.CLAUDE_CODE_DISABLE_ATTACHMENTS).toBe("1");
}

test("a long-lived session and its compaction carry the guard", async () => {
  const { workspaceDir, dataDir } = workspace();
  const conversations = join(dataDir, "conversations");
  createConversationStore(conversations).appendUserMessage("c1", "hello");
  const { sdk, calls } = capturingSdk();
  const backend = createClaudeBackend({
    workspaceDir,
    layout: serverClaudeLayout(dataDir),
    readToken: () => undefined,
    toolSelection: { toolNames: [], includeRunCode: false },
    systemPrompt: "system",
    compactions: createCompactionCheckpoints(conversations),
    sdk,
  });
  const session = await backend.createSession({
    conversationId: "c1",
    model: MODEL,
  });
  await session.prompt("hi");
  await expectGuarded(calls[0]);

  // Compaction runs on the session's own options; fed the options this
  // backend really built, no file call may get through it.
  const { sdk: summarizer, calls: summarized } = capturingSdk();
  let resume: string | undefined = "sdk-session-1";
  const compacting = new ClaudeSession({
    query: summarizer.query,
    conversationId: "c1",
    baseOptions: calls[0] ?? {},
    sessionsStore: {
      getSessionId: () => resume,
      setSessionId: (_c, id) => {
        resume = id;
      },
      remove: () => {
        resume = undefined;
      },
      purge: () => {
        resume = undefined;
      },
      resolveResume: () =>
        resume === undefined
          ? undefined
          : { sessionId: resume, clearedTokens: 0 },
    },
    compactions: createCompactionCheckpoints(conversations),
    model: "claude-sonnet-4-6",
    refreshAuth: () => ({ env: calls[0]?.env ?? {} }),
  });
  await compacting.compact();
  const summary = summarized[0];
  expect(summary?.resume).toBe("sdk-session-1");
  // The summary keeps the turn's tools (the cached prefix) and runs none of
  // them: a call the guard would allow is refused too.
  expect(summary?.tools).toEqual(calls[0]?.tools);
  for (const path of [".houston/runtime/auth.json", "notes.md"])
    expect(await preToolUse(summary, path)).toMatchObject({
      hookSpecificOutput: { permissionDecision: "deny" },
    });
  expect(summary?.disallowedTools).toContain("Read(**/auth.json)");
  expect(summary?.env?.CLAUDE_CODE_DISABLE_ATTACHMENTS).toBe("1");
});

test("a pooled turn carries the guard", async () => {
  const { workspaceDir, dataDir } = workspace();
  const turnRoot = mkdtempSync(join(tmpdir(), "guard-reg-turn-"));
  const { sdk, calls } = capturingSdk();
  const backend = createTurnBackend("anthropic", {
    directories: { workspaceDir, dataDir, turnRoot },
    turn: {
      conversationId: "c1",
      text: "hello",
      provider: "anthropic",
      emit: () => undefined,
      signal: undefined,
      turnId: "t1",
    },
    modelRuntime: {} as ModelRuntime,
    toolSelection: { toolNames: [], includeRunCode: false },
    codeSandbox: null,
    systemPrompt: "system",
    claudeSdk: sdk,
  });
  const session = await backend.createSession({
    conversationId: "c1",
    model: MODEL,
  });
  await session.prompt("hi");
  await expectGuarded(calls[0]);
});

test("a one-shot call offers no tool and refuses any", async () => {
  const { workspaceDir } = workspace();
  const { sdk, calls } = capturingSdk();
  await oneShotWithClaude({
    prompt: "title this",
    systemPrompt: "system",
    workspaceDir,
    readToken: () => undefined,
    query: sdk.query,
  });
  expect(calls[0]?.tools).toEqual([]);
  // Its prompt quotes conversation text, so an `@path` there attaches nothing.
  expect(calls[0]?.env?.CLAUDE_CODE_DISABLE_ATTACHMENTS).toBe("1");
  expect(calls[0]?.disallowedTools).toContain("Read(**/auth.json)");
  expect(await preToolUse(calls[0], "notes.md")).toMatchObject({
    hookSpecificOutput: { permissionDecision: "deny" },
  });
});
