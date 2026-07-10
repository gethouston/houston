import type {
  createSdkMcpServer as CreateSdkMcpServer,
  SdkMcpToolDefinition,
} from "@anthropic-ai/claude-agent-sdk";
import { expect, test } from "vitest";
import { z } from "zod";
import {
  newInteractionHolder,
  runWithInteractionCapture,
} from "../../session/interaction";
import { makeAskUserTool } from "../../session/tools/ask-user";
import { makeIntegrationTools } from "../../session/tools/integrations";
import {
  buildHoustonMcpServer,
  HOUSTON_MCP_SERVER_NAME,
  type HoustonMcp,
  toZodShape,
} from "./custom-tools";
import { type ClaudeQuery, ClaudeSession } from "./session";
import type { SessionsStore } from "./sessions-store";

const INTEGRATIONS = { baseUrl: "http://host.local", sandboxToken: "tok" };

/**
 * Build the MCP server with a fake `createSdkMcpServer` that captures the adapted
 * tool defs, so tests can inspect names/descriptions/schemas/handlers without the
 * real SDK (and without spawning any subprocess).
 */
function build(
  integrations?: { baseUrl: string; sandboxToken: string },
  mode?: "execute" | "plan" | "auto",
): {
  mcp: HoustonMcp;
  tools: SdkMcpToolDefinition[];
  serverName: string;
} {
  let capturedName = "";
  let capturedTools: SdkMcpToolDefinition[] = [];
  const fakeCreate = ((opts: {
    name: string;
    tools: SdkMcpToolDefinition[];
  }) => {
    capturedName = opts.name;
    capturedTools = opts.tools;
    return { type: "sdk", name: opts.name, instance: {} };
  }) as unknown as typeof CreateSdkMcpServer;

  const mcp = buildHoustonMcpServer({
    createSdkMcpServer: fakeCreate,
    integrations,
    mode,
  });
  return { mcp, tools: capturedTools, serverName: capturedName };
}

const byName = (tools: SdkMcpToolDefinition[], name: string) => {
  const t = tools.find((x) => x.name === name);
  if (!t) throw new Error(`no tool ${name}`);
  return t;
};

/** A tool's handler with the model-arg widened to `unknown` for direct calls. */
type LooseHandler = (
  args: unknown,
  extra: unknown,
) => Promise<{ content: { type: string; text: string }[] }>;
const handlerOf = (t: SdkMcpToolDefinition): LooseHandler =>
  t.handler as unknown as LooseHandler;

// --- gating ----------------------------------------------------------------

test("exposes ask_user + suggest_reusable when integrations are absent", () => {
  // execute (undefined mode) keeps the always-on non-blocking tools: ask_user
  // and suggest_reusable (plan_ready is plan-only, so it is stripped here).
  const { mcp, tools, serverName } = build(undefined);
  expect(serverName).toBe(HOUSTON_MCP_SERVER_NAME);
  expect(new Set(tools.map((t) => t.name))).toEqual(
    new Set(["ask_user", "suggest_reusable"]),
  );
  expect(new Set(mcp.allowedTools)).toEqual(
    new Set(["mcp__houston__ask_user", "mcp__houston__suggest_reusable"]),
  );
});

test("exposes ask_user + suggest_reusable + integration tools when the integrations gate is open", () => {
  const { mcp, tools } = build(INTEGRATIONS);
  expect(new Set(tools.map((t) => t.name))).toEqual(
    new Set([
      "ask_user",
      "suggest_reusable",
      "integration_search",
      "integration_execute",
      "request_connection",
    ]),
  );
  expect(new Set(mcp.allowedTools)).toEqual(
    new Set([
      "mcp__houston__ask_user",
      "mcp__houston__suggest_reusable",
      "mcp__houston__integration_search",
      "mcp__houston__integration_execute",
      "mcp__houston__request_connection",
    ]),
  );
});

test("plan mode keeps ask_user + plan_ready even with the integrations gate open", () => {
  // Plan withholds every acting tool but keeps the blocking-question tool and
  // adds the plan-only plan_ready presentation tool.
  const { tools, mcp } = build(INTEGRATIONS, "plan");
  expect(new Set(tools.map((t) => t.name))).toEqual(
    new Set(["ask_user", "plan_ready"]),
  );
  expect(new Set(mcp.allowedTools)).toEqual(
    new Set(["mcp__houston__ask_user", "mcp__houston__plan_ready"]),
  );
});

test("plan_ready is exposed ONLY in plan mode", () => {
  // Present in plan…
  expect(build(INTEGRATIONS, "plan").tools.map((t) => t.name)).toContain(
    "plan_ready",
  );
  // …and stripped from execute and auto, even though it is in the built set.
  expect(build(INTEGRATIONS).tools.map((t) => t.name)).not.toContain(
    "plan_ready",
  );
  expect(build(INTEGRATIONS, "execute").tools.map((t) => t.name)).not.toContain(
    "plan_ready",
  );
  expect(build(INTEGRATIONS, "auto").tools.map((t) => t.name)).not.toContain(
    "plan_ready",
  );
});

test("suggest_reusable is bridged for execute/auto but stripped from plan", () => {
  // The inverse of plan_ready: kept in execute (undefined) and auto, filtered
  // out of plan by `toolNamesForMode`, even though it is in the built set.
  expect(build(INTEGRATIONS).tools.map((t) => t.name)).toContain(
    "suggest_reusable",
  );
  expect(build(INTEGRATIONS, "execute").tools.map((t) => t.name)).toContain(
    "suggest_reusable",
  );
  expect(build(INTEGRATIONS, "auto").tools.map((t) => t.name)).toContain(
    "suggest_reusable",
  );
  expect(build(INTEGRATIONS, "plan").tools.map((t) => t.name)).not.toContain(
    "suggest_reusable",
  );
});

test("auto mode keeps the integration + suggest_reusable tools but drops the blocking tools", () => {
  const { tools, mcp } = build(INTEGRATIONS, "auto");
  // Autopilot never waits on the user: ask_user + request_connection are gone
  // (and plan_ready is plan-only), the acting integration tools stay, and
  // suggest_reusable stays too (it never blocks the turn).
  expect(new Set(tools.map((t) => t.name))).toEqual(
    new Set(["suggest_reusable", "integration_search", "integration_execute"]),
  );
  expect(new Set(mcp.allowedTools)).toEqual(
    new Set([
      "mcp__houston__suggest_reusable",
      "mcp__houston__integration_search",
      "mcp__houston__integration_execute",
    ]),
  );
});

test("auto mode with no integrations gate exposes only suggest_reusable", () => {
  // The always-on custom tools are ask_user (auto drops it), plan_ready
  // (plan-only), and suggest_reusable (auto keeps it) — so with the integration
  // gate closed the server exposes exactly suggest_reusable.
  const { tools, mcp } = build(undefined, "auto");
  expect(tools.map((t) => t.name)).toEqual(["suggest_reusable"]);
  expect(mcp.allowedTools).toEqual(["mcp__houston__suggest_reusable"]);
});

test("the allowlist always matches the exposed tool set", () => {
  const { mcp, tools } = build(INTEGRATIONS);
  expect(mcp.allowedTools).toEqual(
    tools.map((t) => `mcp__${HOUSTON_MCP_SERVER_NAME}__${t.name}`),
  );
});

// --- naming ----------------------------------------------------------------

test("each tool's description restates its bare name for the prompt mandate", () => {
  const { tools } = build(INTEGRATIONS);
  for (const t of tools) {
    expect(t.description.startsWith(`This is the \`${t.name}\` tool`)).toBe(
      true,
    );
  }
  // The shared prompt names ask_user/request_connection bare — the restated name
  // is what maps that mandate onto the mcp__houston__ namespaced tool.
  expect(byName(tools, "ask_user").description).toContain("`ask_user`");
});

// --- schema fidelity -------------------------------------------------------

/** The pi tools, to compare their typebox params against the bridged zod shapes. */
function piParams() {
  const [search, execute, connect] = makeIntegrationTools(INTEGRATIONS);
  return {
    ask_user: makeAskUserTool().parameters as {
      properties: Record<string, unknown>;
      required?: string[];
    },
    integration_search: search.parameters as {
      properties: Record<string, unknown>;
      required?: string[];
    },
    integration_execute: execute.parameters as {
      properties: Record<string, unknown>;
      required?: string[];
    },
    request_connection: connect.parameters as {
      properties: Record<string, unknown>;
      required?: string[];
    },
  };
}

test("bridged schemas expose the same property keys as the pi tool params", () => {
  const { tools } = build(INTEGRATIONS);
  const pi = piParams();
  for (const [name, params] of Object.entries(pi)) {
    const shape = byName(tools, name).inputSchema as Record<string, unknown>;
    expect(new Set(Object.keys(shape))).toEqual(
      new Set(Object.keys(params.properties)),
    );
  }
});

test("bridged schemas enforce the same required vs optional split as pi", () => {
  const { tools } = build(INTEGRATIONS);
  // ask_user: a `questions` array is required; each question needs `question`,
  // options optional.
  const ask = z.object(byName(tools, "ask_user").inputSchema);
  expect(ask.safeParse({ questions: [{ question: "Proceed?" }] }).success).toBe(
    true,
  );
  expect(ask.safeParse({}).success).toBe(false);
  expect(
    ask.safeParse({
      questions: [{ question: "Pick", options: [{ id: "y", label: "Yes" }] }],
    }).success,
  ).toBe(true);
  // A malformed option (missing label) is rejected — nested object shape matched.
  expect(
    ask.safeParse({ questions: [{ question: "Pick", options: [{ id: "y" }] }] })
      .success,
  ).toBe(false);

  // integration_execute: action required, params (a record) optional.
  const exec = z.object(byName(tools, "integration_execute").inputSchema);
  expect(exec.safeParse({ action: "GMAIL_SEND_EMAIL" }).success).toBe(true);
  expect(exec.safeParse({}).success).toBe(false);
  expect(
    exec.safeParse({ action: "X", params: { to: "a@b.c", n: 1 } }).success,
  ).toBe(true);

  // request_connection: toolkit required, reason optional.
  const conn = z.object(byName(tools, "request_connection").inputSchema);
  expect(conn.safeParse({ toolkit: "gmail" }).success).toBe(true);
  expect(conn.safeParse({}).success).toBe(false);

  // integration_search: query required.
  const search = z.object(byName(tools, "integration_search").inputSchema);
  expect(search.safeParse({ query: "send email" }).success).toBe(true);
  expect(search.safeParse({}).success).toBe(false);
});

test("toZodShape carries descriptions and maps typebox records to zod records", () => {
  const shape = toZodShape(
    makeIntegrationTools(INTEGRATIONS)[1].parameters, // integration_execute
  );
  expect(shape.action.description).toContain("action slug");
  // params is an optional record<string, unknown>: an object of arbitrary keys
  // parses, a non-object is rejected.
  const params = z.object({ params: shape.params });
  expect(params.safeParse({ params: { any: "thing", n: 2 } }).success).toBe(
    true,
  );
  expect(params.safeParse({ params: "not-an-object" }).success).toBe(false);
});

// --- handler execution records the interaction ------------------------------

test("the ask_user handler records a question interaction into the turn holder", async () => {
  const { tools } = build(INTEGRATIONS);
  const handler = handlerOf(byName(tools, "ask_user"));
  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, () =>
    handler(
      {
        questions: [
          { question: "Proceed?", options: [{ id: "y", label: "Yes" }] },
        ],
      },
      {},
    ),
  );
  expect(holder.pending).toEqual({
    steps: [
      {
        kind: "question",
        id: "q1",
        question: "Proceed?",
        options: [{ id: "y", label: "Yes" }],
      },
    ],
  });
});

test("the request_connection handler records a connect interaction", async () => {
  const { tools } = build(INTEGRATIONS);
  const handler = handlerOf(byName(tools, "request_connection"));
  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, () =>
    handler({ toolkit: "Gmail", reason: "to send mail" }, {}),
  );
  // toolkit is normalized (lowercased/trimmed) by the reused pi implementation.
  expect(holder.pending).toEqual({
    steps: [
      { kind: "connect", id: "c1", toolkit: "gmail", reason: "to send mail" },
    ],
  });
});

test("a handler run outside any turn records nothing and still returns content", async () => {
  const { tools } = build(INTEGRATIONS);
  const result = await handlerOf(byName(tools, "ask_user"))(
    { questions: [{ question: "Anyone there?" }] },
    {},
  );
  expect(result.content[0]).toMatchObject({ type: "text" });
});

// --- ALS propagation through a Claude-session turn (requirement 4) ----------

function fakeStore(): SessionsStore {
  return {
    getSessionId: () => undefined,
    setSessionId: () => {},
    remove: () => {},
    purge: () => {},
    resolveResume: () => undefined,
  };
}

test("an ask_user call dispatched during a Claude-session turn lands in the turn's interaction holder", async () => {
  const { tools } = build(INTEGRATIONS);
  const handler = handlerOf(byName(tools, "ask_user"));

  // Model the SDK's real dispatch: `query()` spawns a background reader task
  // SYNCHRONOUSLY (here, an IIFE), which later invokes the tool handler across an
  // async boundary. The task inherits whatever AsyncLocalStorage context was
  // active when `query()` was called — i.e. the turn's interaction holder that
  // exec-turn establishes around `session.prompt()`. If ALS did NOT propagate,
  // the handler's `recordQuestions` call would be a no-op and this fails.
  const query: ClaudeQuery = () => {
    const dispatched = (async () => {
      await Promise.resolve();
      await handler({ questions: [{ question: "Ready to send?" }] }, {});
    })();
    // A stream that yields nothing but only reports done once the background
    // dispatch (the handler call) has run — mirrors a turn whose sole effect was
    // an ask_user recorded off the subprocess control channel.
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
  });

  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, () => session.prompt("hi"));

  // This is exactly the value exec-turn reads after prompt() resolves and
  // attaches to the clean `done` frame as `pendingInteraction`.
  expect(holder.pending).toEqual({
    steps: [{ kind: "question", id: "q1", question: "Ready to send?" }],
  });
});
