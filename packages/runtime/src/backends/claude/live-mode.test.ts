import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  CanUseTool,
  createSdkMcpServer as CreateSdkMcpServer,
  PermissionResult,
  SdkMcpToolDefinition,
} from "@anthropic-ai/claude-agent-sdk";
import { expect, test } from "vitest";
import {
  runWithTurnMode,
  type TurnModeRef,
} from "../../session/turn-mode-context";
import { buildHoustonMcpServer } from "./custom-tools";
import { type ClaudeQuery, ClaudeSession } from "./session";
import type { SessionsStore } from "./sessions-store";
import { makeCanUseTool } from "./tool-policy";

const CTX: Parameters<CanUseTool>[2] = {
  signal: new AbortController().signal,
  toolUseID: "t",
  requestId: "r",
};

function workspace(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), "claude-live-")));
}

async function decide(
  can: CanUseTool,
  tool: string,
  input: Record<string, unknown>,
): Promise<PermissionResult> {
  const r = await can(tool, input, CTX);
  if (!r) throw new Error("expected a permission result");
  return r;
}

test("a live flip to plan denies Edit/Write/Bash at permission time, and flipping back re-allows", async () => {
  const ws = workspace();
  const can = makeCanUseTool(ws);
  const ref: TurnModeRef = { current: "execute" };
  await runWithTurnMode(ref, async () => {
    const target = { file_path: join(ws, "a.txt") };
    expect((await decide(can, "Write", target)).behavior).toBe("allow");

    ref.current = "plan";
    for (const tool of ["Edit", "Write"]) {
      const r = await decide(can, tool, target);
      expect(r.behavior).toBe("deny");
      if (r.behavior === "deny") expect(r.message).toMatch(/Plan mode/);
    }
    expect((await decide(can, "Bash", { command: "ls" })).behavior).toBe(
      "deny",
    );
    expect((await decide(can, "Read", target)).behavior).toBe("allow");

    ref.current = "execute";
    expect((await decide(can, "Write", target)).behavior).toBe("allow");
  });
});

test("outside a turn (no ambient mode) the plan gate never fires", async () => {
  const ws = workspace();
  const can = makeCanUseTool(ws);
  const r = await decide(can, "Write", { file_path: join(ws, "a.txt") });
  expect(r.behavior).toBe("allow");
});

function fakeStore(): SessionsStore {
  return {
    getSessionId: () => undefined,
    setSessionId: () => {},
    remove: () => {},
    purge: () => {},
    resolveResume: () => undefined,
  };
}

test("a mid-turn flip reaches canUseTool dispatched off a Claude-session turn", async () => {
  const ws = workspace();
  const can = makeCanUseTool(ws);
  const ref: TurnModeRef = { current: "execute" };
  const decisions: PermissionResult[] = [];

  const query: ClaudeQuery = () => {
    const dispatched = (async () => {
      await Promise.resolve();
      decisions.push(await decide(can, "Write", { file_path: join(ws, "a") }));
      ref.current = "plan";
      decisions.push(await decide(can, "Write", { file_path: join(ws, "b") }));
    })();
    return {
      [Symbol.asyncIterator]: () => ({
        next: async () => {
          await dispatched;
          return { done: true, value: undefined };
        },
      }),
    };
  };

  const session = new ClaudeSession({
    query,
    conversationId: "c1",
    baseOptions: {},
    sessionsStore: fakeStore(),
    model: "claude-sonnet-4-6",
    refreshAuth: () => ({ env: {} }),
  });
  await runWithTurnMode(ref, () => session.prompt("hi"));

  expect(decisions[0]?.behavior).toBe("allow");
  expect(decisions[1]?.behavior).toBe("deny");
});

test("a mid-turn flip to auto makes the bridged ask_user refuse", async () => {
  let tools: SdkMcpToolDefinition[] = [];
  buildHoustonMcpServer({
    createSdkMcpServer: ((opts: { tools: SdkMcpToolDefinition[] }) => {
      tools = opts.tools;
      return { type: "sdk", name: "houston", instance: {} };
    }) as unknown as typeof CreateSdkMcpServer,
    mode: "execute",
  });
  const askUser = tools.find((t) => t.name === "ask_user");
  if (!askUser) throw new Error("no ask_user tool");
  const handler = askUser.handler as unknown as (
    args: unknown,
    extra: unknown,
  ) => Promise<unknown>;

  const ref: TurnModeRef = { current: "auto" };
  await runWithTurnMode(ref, async () => {
    await expect(
      handler({ questions: [{ question: "Which color?" }] }, {}),
    ).rejects.toThrow(/Autopilot/);
  });
});
