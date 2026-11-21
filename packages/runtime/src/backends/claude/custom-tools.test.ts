import type {
  createSdkMcpServer as CreateSdkMcpServer,
  SdkMcpToolDefinition,
} from "@anthropic-ai/claude-agent-sdk";
import type { ProviderOption } from "@houston/domain";
import { expect, test } from "vitest";
import { z } from "zod";
import {
  newInteractionHolder,
  runWithInteractionCapture,
} from "../../session/interaction";
import { makeAskUserTool } from "../../session/tools/ask-user";
import {
  ASSISTANT_TOOL_NAMES,
  type AssistantToolOptions,
} from "../../session/tools/assistant";
import { makeIntegrationTools } from "../../session/tools/integrations";
import { makeMissionTools } from "../../session/tools/missions";
import { makePlanReadyTool } from "../../session/tools/plan-ready";
import { makeReadMissionTool } from "../../session/tools/read-mission";
import { httpSandboxFetch } from "../../session/tools/sandbox-fetch";
import {
  type BridgedPiTool,
  buildHoustonMcpServer,
  HOUSTON_MCP_SERVER_NAME,
  type HoustonMcp,
} from "./custom-tools";
import { toZodShape } from "./schema-to-zod";
import { type ClaudeQuery, ClaudeSession } from "./session";
import type { SessionsStore } from "./sessions-store";

const INTEGRATIONS = {
  call: httpSandboxFetch("http://host.local", "tok"),
};

function build(
  integrations?: { call: ReturnType<typeof httpSandboxFetch> },
  mode?: "execute" | "plan" | "auto",
  explicitTools?: BridgedPiTool[],
  assistant?: AssistantToolOptions,
  personalAssistant?: boolean,
  providers?: readonly ProviderOption[],
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
    assistant,
    personalAssistant,
    mode,
    tools: explicitTools,
    providers,
  });
  return { mcp, tools: capturedTools, serverName: capturedName };
}

const byName = (tools: SdkMcpToolDefinition[], name: string) => {
  const t = tools.find((x) => x.name === name);
  if (!t) throw new Error(`no tool ${name}`);
  return t;
};

type LooseHandler = (
  args: unknown,
  extra: unknown,
) => Promise<{ content: { type: string; text: string }[] }>;
const handlerOf = (t: SdkMcpToolDefinition): LooseHandler =>
  t.handler as unknown as LooseHandler;

test("exposes ask_user + suggest_reusable when integrations are absent", () => {
  const { mcp, tools, serverName } = build(undefined);
  expect(serverName).toBe(HOUSTON_MCP_SERVER_NAME);
  expect(new Set(tools.map((t) => t.name))).toEqual(
    new Set(["ask_user", "suggest_reusable", "suggest_actions"]),
  );
  expect(new Set(mcp.allowedTools)).toEqual(
    new Set([
      "mcp__houston__ask_user",
      "mcp__houston__suggest_reusable",
      "mcp__houston__suggest_actions",
    ]),
  );
});

test("exposes ask_user + suggest_reusable + integration tools when the integrations gate is open", () => {
  const { mcp, tools } = build(INTEGRATIONS);
  expect(new Set(tools.map((t) => t.name))).toEqual(
    new Set([
      "ask_user",
      "suggest_reusable",
      "suggest_actions",
      "save_routine",
      "save_learning",
      "start_mission",
      "list_missions",
      "read_mission",
      "update_mission_status",
      "list_agents",
      "read_agent",
      "integration_search",
      "integration_execute",
      "request_connection",
      "custom_integration_detect",
      "custom_integration_add",
      "custom_integration_remove",
      "request_credential",
      "request_provider_connection",
      "request_hands_on",
    ]),
  );
  expect(new Set(mcp.allowedTools)).toEqual(
    new Set([
      "mcp__houston__ask_user",
      "mcp__houston__suggest_reusable",
      "mcp__houston__suggest_actions",
      "mcp__houston__save_routine",
      "mcp__houston__save_learning",
      "mcp__houston__start_mission",
      "mcp__houston__list_missions",
      "mcp__houston__read_mission",
      "mcp__houston__update_mission_status",
      "mcp__houston__list_agents",
      "mcp__houston__read_agent",
      "mcp__houston__integration_search",
      "mcp__houston__integration_execute",
      "mcp__houston__request_connection",
      "mcp__houston__custom_integration_detect",
      "mcp__houston__custom_integration_add",
      "mcp__houston__custom_integration_remove",
      "mcp__houston__request_credential",
      "mcp__houston__request_provider_connection",
      "mcp__houston__request_hands_on",
    ]),
  );
});

test("plan mode keeps ask_user + plan_ready even with the integrations gate open", () => {
  const { tools, mcp } = build(INTEGRATIONS, "plan");
  expect(new Set(tools.map((t) => t.name))).toEqual(
    new Set(["ask_user", "plan_ready"]),
  );
  expect(new Set(mcp.allowedTools)).toEqual(
    new Set(["mcp__houston__ask_user", "mcp__houston__plan_ready"]),
  );
});

test("plan_ready is exposed ONLY in plan mode", () => {
  expect(build(INTEGRATIONS, "plan").tools.map((t) => t.name)).toContain(
    "plan_ready",
  );
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

test("save_routine is bridged for execute/auto but stripped from plan", () => {
  expect(build(INTEGRATIONS).tools.map((t) => t.name)).toContain(
    "save_routine",
  );
  expect(build(INTEGRATIONS, "execute").tools.map((t) => t.name)).toContain(
    "save_routine",
  );
  expect(build(INTEGRATIONS, "auto").tools.map((t) => t.name)).toContain(
    "save_routine",
  );
  expect(build(INTEGRATIONS, "plan").tools.map((t) => t.name)).not.toContain(
    "save_routine",
  );
  expect(build(undefined).tools.map((t) => t.name)).not.toContain(
    "save_routine",
  );
});

test("save_learning is bridged for execute/auto but stripped from plan", () => {
  expect(build(INTEGRATIONS).tools.map((t) => t.name)).toContain(
    "save_learning",
  );
  expect(build(INTEGRATIONS, "execute").tools.map((t) => t.name)).toContain(
    "save_learning",
  );
  expect(build(INTEGRATIONS, "auto").tools.map((t) => t.name)).toContain(
    "save_learning",
  );
  expect(build(INTEGRATIONS, "plan").tools.map((t) => t.name)).not.toContain(
    "save_learning",
  );
  expect(build(undefined).tools.map((t) => t.name)).not.toContain(
    "save_learning",
  );
});

const ASSISTANT: AssistantToolOptions = {
  catalog: { version: 3, sourceHash: "fixture", operations: [] },
  call: httpSandboxFetch("http://host.local", "tok"),
};

test("the assistant family is bridged whole for execute/auto but stripped from plan", () => {
  const names = (mode?: "execute" | "plan" | "auto") =>
    build(undefined, mode, undefined, ASSISTANT).tools.map((t) => t.name);
  for (const name of ASSISTANT_TOOL_NAMES) {
    expect(names()).toContain(name);
    expect(names("execute")).toContain(name);
    expect(names("auto")).toContain(name);
    expect(names("plan")).not.toContain(name);
    expect(build(undefined).tools.map((t) => t.name)).not.toContain(name);
  }
  expect(names()).toContain("houston_recall");
  expect(ASSISTANT_TOOL_NAMES).toContain("houston_recall");
});

test("auto mode keeps the integration + suggest_reusable tools but drops ask_user", () => {
  const { tools, mcp } = build(INTEGRATIONS, "auto");
  expect(new Set(tools.map((t) => t.name))).toEqual(
    new Set([
      "suggest_reusable",
      "suggest_actions",
      "save_routine",
      "save_learning",
      "start_mission",
      "list_missions",
      "read_mission",
      "update_mission_status",
      "list_agents",
      "read_agent",
      "integration_search",
      "integration_execute",
      "request_connection",
      "custom_integration_detect",
      "custom_integration_add",
      "custom_integration_remove",
      "request_credential",
      "request_provider_connection",
      "request_hands_on",
    ]),
  );
  expect(new Set(mcp.allowedTools)).toEqual(
    new Set([
      "mcp__houston__suggest_reusable",
      "mcp__houston__suggest_actions",
      "mcp__houston__save_routine",
      "mcp__houston__save_learning",
      "mcp__houston__start_mission",
      "mcp__houston__list_missions",
      "mcp__houston__read_mission",
      "mcp__houston__update_mission_status",
      "mcp__houston__list_agents",
      "mcp__houston__read_agent",
      "mcp__houston__integration_search",
      "mcp__houston__integration_execute",
      "mcp__houston__request_connection",
      "mcp__houston__custom_integration_detect",
      "mcp__houston__custom_integration_add",
      "mcp__houston__custom_integration_remove",
      "mcp__houston__request_credential",
      "mcp__houston__request_provider_connection",
      "mcp__houston__request_hands_on",
    ]),
  );
});

test("auto mode with no integrations gate exposes only suggest_reusable", () => {
  const { tools, mcp } = build(undefined, "auto");
  expect(tools.map((t) => t.name)).toEqual([
    "suggest_reusable",
    "suggest_actions",
  ]);
  expect(mcp.allowedTools).toEqual([
    "mcp__houston__suggest_reusable",
    "mcp__houston__suggest_actions",
  ]);
});

test("the allowlist always matches the exposed tool set", () => {
  const { mcp, tools } = build(INTEGRATIONS);
  expect(mcp.allowedTools).toEqual(
    tools.map((t) => `mcp__${HOUSTON_MCP_SERVER_NAME}__${t.name}`),
  );
});

test("an explicit tool list replaces the server defaults and remains mode-filtered", () => {
  const explicit = [
    makeAskUserTool(),
    makePlanReadyTool(),
  ] as unknown as BridgedPiTool[];

  expect(
    build(INTEGRATIONS, undefined, explicit).tools.map((t) => t.name),
  ).toEqual(["ask_user"]);
  expect(
    build(INTEGRATIONS, "plan", explicit).tools.map((t) => t.name),
  ).toEqual(["ask_user", "plan_ready"]);
});

test("each tool's description is the pi tool's own, with no per-tool preamble", () => {
  const { tools } = build(INTEGRATIONS);
  expect(byName(tools, "ask_user").description).toBe(
    makeAskUserTool().description,
  );
  for (const t of tools) expect(t.description).not.toContain("This is the `");
});

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
  expect(
    ask.safeParse({ questions: [{ question: "Pick", options: [{ id: "y" }] }] })
      .success,
  ).toBe(false);

  const exec = z.object(byName(tools, "integration_execute").inputSchema);
  expect(exec.safeParse({ action: "GMAIL_SEND_EMAIL" }).success).toBe(true);
  expect(exec.safeParse({}).success).toBe(false);
  expect(
    exec.safeParse({ action: "X", params: { to: "a@b.c", n: 1 } }).success,
  ).toBe(true);

  const conn = z.object(byName(tools, "request_connection").inputSchema);
  expect(conn.safeParse({ toolkit: "gmail" }).success).toBe(true);
  expect(conn.safeParse({}).success).toBe(false);

  const search = z.object(byName(tools, "integration_search").inputSchema);
  expect(search.safeParse({ query: "send email" }).success).toBe(true);
  expect(search.safeParse({}).success).toBe(false);
});

test("toZodShape carries descriptions and maps typebox records to zod records", () => {
  const shape = toZodShape(makeIntegrationTools(INTEGRATIONS)[1].parameters);
  expect(shape.action.description).toContain("action slug");
  const params = z.object({ params: shape.params });
  expect(params.safeParse({ params: { any: "thing", n: 2 } }).success).toBe(
    true,
  );
  expect(params.safeParse({ params: "not-an-object" }).success).toBe(false);
});

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

  const query: ClaudeQuery = () => {
    const dispatched = (async () => {
      await Promise.resolve();
      await handler({ questions: [{ question: "Ready to send?" }] }, {});
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

  const holder = newInteractionHolder();
  await runWithInteractionCapture(holder, () => session.prompt("hi"));

  expect(holder.pending).toEqual({
    steps: [{ kind: "question", id: "q1", question: "Ready to send?" }],
  });
});

const MISSION_PROVIDERS: ProviderOption[] = [
  {
    id: "openai-codex",
    name: "ChatGPT / Codex (Plus / Pro)",
    connected: true,
    models: ["gpt-5.5"],
  },
  { id: "anthropic", name: "Claude (Pro / Max)", connected: false },
];

function missionPiParams(personalAssistant: boolean) {
  const opts = {
    ...INTEGRATIONS,
    personalAssistant,
    providers: MISSION_PROVIDERS,
  };
  const [start, list, update] = makeMissionTools(opts);
  const read = makeReadMissionTool(opts);
  if (!start || !list || !update) throw new Error("missing mission tools");
  const shape = (t: { parameters: unknown }) =>
    t.parameters as {
      properties: Record<string, unknown>;
      required?: string[];
    };
  return {
    start_mission: shape(start),
    list_missions: shape(list),
    read_mission: shape(read),
    update_mission_status: shape(update),
  };
}

test("the assistant's bridged set is the coordinator surface, nothing that works", () => {
  const { tools, mcp } = build(
    INTEGRATIONS,
    undefined,
    undefined,
    ASSISTANT,
    true,
  );
  expect(new Set(tools.map((t) => t.name))).toEqual(
    new Set([
      "ask_user",
      "suggest_reusable",
      "suggest_actions",
      "save_learning",
      "start_mission",
      "list_missions",
      "read_mission",
      "update_mission_status",
      ...ASSISTANT_TOOL_NAMES,
      "request_connection",
      "request_credential",
      "request_provider_connection",
      "request_hands_on",
    ]),
  );
  for (const banned of [
    "mcp__houston__integration_execute",
    "mcp__houston__save_routine",
  ]) {
    expect(mcp.allowedTools).not.toContain(banned);
  }
});

test("every other agent's bridged set is untouched by the coordinator clamp", () => {
  const plain = build(INTEGRATIONS).tools.map((t) => t.name);
  const explicitFalse = build(
    INTEGRATIONS,
    undefined,
    undefined,
    undefined,
    false,
  ).tools.map((t) => t.name);
  expect(explicitFalse).toEqual(plain);
  expect(plain).toContain("integration_execute");
});

test("the mission tools bridge with the same keys and split as pi, both roles", () => {
  for (const personalAssistant of [false, true]) {
    const { tools } = build(
      INTEGRATIONS,
      undefined,
      undefined,
      ASSISTANT,
      personalAssistant,
      MISSION_PROVIDERS,
    );
    for (const [name, params] of Object.entries(
      missionPiParams(personalAssistant),
    )) {
      const shape = byName(tools, name).inputSchema as Record<string, unknown>;
      expect(new Set(Object.keys(shape))).toEqual(
        new Set(Object.keys(params.properties)),
      );
      expect(params.required ?? []).not.toContain("agent");
    }
    const start = z.object(byName(tools, "start_mission").inputSchema);
    expect(start.safeParse({ title: "t", prompt: "p" }).success).toBe(true);
    expect(
      start.safeParse({ agent: "Dobby", title: "t", prompt: "p" }).success,
    ).toBe(true);
    expect(start.safeParse({ title: "t" }).success).toBe(false);
    const list = z.object(byName(tools, "list_missions").inputSchema);
    expect(list.safeParse({}).success).toBe(true);
    expect(list.safeParse({ agent: "Dobby" }).success).toBe(true);
  }
});

test("start_mission's provider enum survives the bridge with the same ids", () => {
  const { tools } = build(
    INTEGRATIONS,
    undefined,
    undefined,
    ASSISTANT,
    false,
    MISSION_PROVIDERS,
  );
  const shape = byName(tools, "start_mission").inputSchema as Record<
    string,
    z.ZodType
  >;
  const provider = z.object({ provider: shape.provider ?? z.never() });
  expect(provider.safeParse({ provider: "openai-codex" }).success).toBe(true);
  expect(provider.safeParse({ provider: "anthropic" }).success).toBe(false);
  expect(provider.safeParse({ provider: "codex" }).success).toBe(false);
  expect(provider.safeParse({}).success).toBe(true);
});

test("with no provider connected neither backend offers the param", () => {
  const { tools } = build(
    INTEGRATIONS,
    undefined,
    undefined,
    ASSISTANT,
    false,
    [],
  );
  const shape = byName(tools, "start_mission").inputSchema as Record<
    string,
    z.ZodType
  >;
  expect(shape.provider).toBeUndefined();
  expect(
    Object.keys(missionPiParamsFor([]).start_mission.properties),
  ).not.toContain("provider");
});

function missionPiParamsFor(providers: readonly ProviderOption[]) {
  const [start] = makeMissionTools({
    ...INTEGRATIONS,
    personalAssistant: false,
    providers,
  });
  if (!start) throw new Error("missing start_mission");
  return {
    start_mission: start.parameters as unknown as {
      properties: Record<string, unknown>;
    },
  };
}

test("the mode union bridges as a closed set too, not an opaque value", () => {
  const { tools } = build(INTEGRATIONS);
  const shape = byName(tools, "start_mission").inputSchema as Record<
    string,
    z.ZodType
  >;
  const mode = z.object({ mode: shape.mode ?? z.never() });
  expect(mode.safeParse({ mode: "plan" }).success).toBe(true);
  expect(mode.safeParse({ mode: "yolo" }).success).toBe(false);
});
