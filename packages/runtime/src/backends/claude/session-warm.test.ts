import { AsyncLocalStorage } from "node:async_hooks";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  HookCallback,
  Options,
  SDKMessage,
  SdkMcpToolDefinition,
} from "@anthropic-ai/claude-agent-sdk";
import { Type } from "typebox";
import { beforeEach, expect, test, vi } from "vitest";
import type { HarnessSession, ResolvedModel } from "../types";
import { type ClaudeBackendDeps, createClaudeBackend } from "./backend";
import type { BridgedPiTool } from "./custom-tools";
import { serverClaudeLayout } from "./paths";
import type { ClaudeSdk } from "./sdk-loader";

/**
 * A CLI started ahead of its prompt (`ClaudeSession.warm`): the prompt runs
 * on it only with the exact launch a cold spawn would have used, its
 * callbacks run in the PROMPT's async context, and one no prompt takes is
 * stopped (and its exit awaited) before anything else opens the session.
 */

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

const MODEL: ResolvedModel = {
  provider: "anthropic",
  id: "claude-sonnet-4-6",
  contextWindow: 200_000,
};

const als = new AsyncLocalStorage<string>();

const SCRIPT: SDKMessage[] = [
  {
    type: "system",
    subtype: "init",
    session_id: "s-new",
  } as unknown as SDKMessage,
  {
    type: "result",
    subtype: "success",
    usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0 },
    session_id: "s-new",
  } as unknown as SDKMessage,
];

async function* scripted(): AsyncGenerator<SDKMessage> {
  for (const message of SCRIPT) yield message;
}

/** The SDK, scripted: `startup` starts its stream reader at spawn, as the real one does. */
function fakeSdk(input: {
  failStartup?: boolean;
  /** What the CLI does once prompted, from the reader started at spawn. */
  onPrompt?: (options: Options, tools: SdkMcpToolDefinition[]) => Promise<void>;
}) {
  const log: string[] = [];
  const spawned: Options[] = [];
  const cold: Options[] = [];
  let tools: SdkMcpToolDefinition[] = [];
  const sdk: ClaudeSdk = {
    query: ({ prompt, options }) => {
      log.push(`cold:${prompt}`);
      cold.push(options);
      return scripted();
    },
    createSdkMcpServer: ((server: {
      name: string;
      tools: SdkMcpToolDefinition[];
    }) => {
      tools = server.tools;
      return { type: "sdk", name: server.name, instance: {} };
    }) as unknown as ClaudeSdk["createSdkMcpServer"],
    startup: async ({ options }) => {
      log.push("spawn");
      spawned.push(options);
      if (input.failStartup) throw new Error("spawn failed");
      let send: (prompt: string) => void = () => undefined;
      const prompted = new Promise<string>((resolve) => {
        send = resolve;
      });
      const reader = (async () => {
        await prompted;
        await input.onPrompt?.(options, tools);
      })();
      return {
        query(prompt) {
          if (typeof prompt !== "string") {
            // No prompt: the CLI reads its closed input and exits.
            const exited = (async () => {
              for await (const _message of prompt) log.push("unexpected");
              log.push("exited");
            })();
            return {
              [Symbol.asyncIterator]: () => ({
                next: async () => {
                  await exited;
                  return { done: true as const, value: undefined };
                },
              }),
            };
          }
          log.push(`warm:${prompt}`);
          send(prompt);
          return (async function* () {
            await reader;
            yield* scripted();
          })();
        },
        close: () => log.push("closed"),
      };
    },
  };
  return { sdk, log, spawned, cold };
}

function deps(
  sdk: ClaudeSdk,
  extra: Partial<ClaudeBackendDeps> = {},
): ClaudeBackendDeps {
  const workspaceDir =
    extra.workspaceDir ?? mkdtempSync(join(tmpdir(), "claude-warm-"));
  return {
    workspaceDir,
    layout: serverClaudeLayout(workspaceDir),
    readToken: () => ({ kind: "oauth-token", value: "sk-ant-oat01-x" }),
    toolSelection: { toolNames: [], includeRunCode: false },
    systemPrompt: "houston",
    sdk,
    ...extra,
  };
}

async function open(sdk: ClaudeSdk, extra?: Partial<ClaudeBackendDeps>) {
  const session = await createClaudeBackend(deps(sdk, extra)).createSession({
    conversationId: "c1",
    model: MODEL,
  });
  return session as HarnessSession & {
    warm(): void;
    releaseWarm(): Promise<void>;
  };
}

/** The options that decide what a spawned CLI is (callbacks aside). */
function launchOf(options: Options | undefined) {
  if (!options) return undefined;
  const { abortController, canUseTool, hooks, mcpServers, ...rest } = options;
  return rest;
}

test("a warmed session prompts the CLI it started, launched exactly as a cold spawn", async () => {
  const workspaceDir = mkdtempSync(join(tmpdir(), "claude-warm-"));
  const warmSdk = fakeSdk({});
  const warmed = await open(warmSdk.sdk, { workspaceDir });
  warmed.warm();
  await warmed.prompt("hello");
  expect(warmSdk.log).toEqual(["spawn", "warm:hello"]);

  const coldSdk = fakeSdk({});
  const cold = await open(coldSdk.sdk, { workspaceDir });
  await cold.prompt("hello");
  expect(coldSdk.log).toEqual(["cold:hello"]);

  const warmLaunch = launchOf(warmSdk.spawned[0]);
  expect(warmLaunch).toEqual(launchOf(coldSdk.cold[0]));
  expect(warmLaunch?.env?.CLAUDE_CODE_OAUTH_TOKEN).toBe("sk-ant-oat01-x");
  expect(warmLaunch?.model).toBe("claude-sonnet-4-6");
});

test("the started CLI's callbacks run in the prompt's context, not the spawn's", async () => {
  const seen: Record<string, string | undefined> = {};
  const probe: BridgedPiTool = {
    name: "ask_user",
    description: "probe",
    parameters: Type.Object({}),
    execute: async () => {
      seen.tool = als.getStore();
      return { content: [{ type: "text", text: "ok" }], details: {} };
    },
  };
  const { sdk } = fakeSdk({
    onPrompt: async (options, tools) => {
      // Control: an unbound callback sees where the reader started.
      seen.unbound = als.getStore();
      await tools.find((t) => t.name === "ask_user")?.handler({}, {});
      const gate = options.hooks?.PreToolUse?.[0]?.hooks[0] as HookCallback;
      await gate(
        { hook_event_name: "PreToolUse" } as Parameters<HookCallback>[0],
        "tool-1",
        { signal: new AbortController().signal },
      );
    },
  });
  const session = await open(sdk, {
    tools: [probe],
    beforeTool: async () => {
      seen.hook = als.getStore();
    },
  });
  als.run("spawn", () => session.warm());
  await als.run("prompt", () => session.prompt("go"));
  expect(seen).toEqual({ unbound: "spawn", tool: "prompt", hook: "prompt" });
});

test("a launch that changed stops the started CLI, awaits its exit, then spawns cold", async () => {
  const { sdk, log } = fakeSdk({});
  const session = await open(sdk);
  session.warm();
  session.setThinkingLevel("high");
  await session.prompt("go");
  expect(log).toEqual(["spawn", "exited", "cold:go"]);
});

test("a CLI that failed to start leaves the prompt to its own spawn", async () => {
  const { sdk, log } = fakeSdk({ failStartup: true });
  const session = await open(sdk);
  session.warm();
  await session.prompt("go");
  expect(log).toEqual(["spawn", "cold:go"]);
  expect(console.warn).toHaveBeenCalledWith(
    expect.stringContaining("spawn failed"),
  );
});

test("releasing a CLI no prompt took waits for it to exit, and a later prompt spawns its own", async () => {
  const { sdk, log } = fakeSdk({});
  const session = await open(sdk);
  session.warm();
  await session.releaseWarm();
  expect(log).toEqual(["spawn", "exited"]);
  await session.prompt("go");
  expect(log).toEqual(["spawn", "exited", "cold:go"]);
});

test("a compaction first stops the started CLI that resumed the same session", async () => {
  const { sdk, log } = fakeSdk({});
  const session = await open(sdk);
  session.warm();
  await session.compact().catch(() => undefined);
  expect(log.slice(0, 2)).toEqual(["spawn", "exited"]);
});

test("dispose stops a started CLI no prompt took", async () => {
  const { sdk, log } = fakeSdk({});
  const session = await open(sdk);
  session.warm();
  session.dispose();
  await vi.waitFor(() => expect(log).toEqual(["spawn", "exited"]));
});

test("an SDK without startup never starts a CLI early", async () => {
  const { sdk, log } = fakeSdk({});
  const session = await open({ ...sdk, startup: undefined });
  session.warm();
  await session.prompt("go");
  expect(log).toEqual(["cold:go"]);
});
