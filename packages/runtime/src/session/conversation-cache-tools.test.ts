import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";

const captured = vi.hoisted(() => ({
  tools: [] as string[],
  customTools: [] as string[],
}));

vi.mock("../backends/pi/backend", () => ({
  createPiBackend: (deps: {
    tools: string[];
    customTools: { name: string }[];
  }) => {
    captured.tools = [...deps.tools];
    captured.customTools = deps.customTools.map((t) => t.name);
    return {
      id: "pi",
      createSession: () => {
        throw new Error("conversation-cache-tools.test never runs a turn");
      },
    };
  },
}));

const PI_BUILTIN_TOOL_NAMES = new Set<string>();

const unregistered = (tools: string[], customTools: string[]): string[] =>
  tools.filter(
    (name) => !PI_BUILTIN_TOOL_NAMES.has(name) && !customTools.includes(name),
  );

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

process.env.HOUSTON_DATA_DIR = mkdtempSync(join(tmpdir(), "houston-cct-data-"));
process.env.HOUSTON_WORKSPACE_DIR = mkdtempSync(
  join(tmpdir(), "houston-cct-ws-"),
);

await import("./conversation-cache");
const base = {
  tools: [...captured.tools],
  customTools: [...captured.customTools],
};

test("pi registers a custom tool object for every allowlisted custom-tool name", () => {
  expect(unregistered(base.tools, base.customTools)).toEqual([]);
});

test("pi's customTools include suggest_actions", () => {
  expect(base.customTools).toContain("suggest_actions");
});

test("pi's always-on custom tool set is exactly the ungated Houston tools", () => {
  expect(new Set(base.customTools)).toEqual(
    new Set([
      "read",
      "ls",
      "grep",
      "find",
      "edit",
      "write",
      "ask_user",
      "plan_ready",
      "suggest_reusable",
      "suggest_actions",
      "bash",
      "browser",
    ]),
  );
});

test("the suggest tools survive the execute and auto allowlists but not plan", async () => {
  const { toolNamesForMode } = await import("./tool-selection");
  for (const mode of ["execute", "auto"] as const) {
    const allowed = toolNamesForMode(mode, base.tools);
    expect(allowed).toContain("suggest_actions");
    expect(allowed).toContain("suggest_reusable");
    expect(unregistered(allowed, base.customTools)).toEqual([]);
  }
  const plan = toolNamesForMode("plan", base.tools);
  expect(plan).not.toContain("suggest_actions");
  expect(plan).not.toContain("suggest_reusable");
});

test("pi registers every allowlisted custom tool with the host + sandbox gates open", async () => {
  const prior = {
    controlPlane: process.env.HOUSTON_CONTROL_PLANE_URL,
    sandboxToken: process.env.HOUSTON_SANDBOX_TOKEN,
    codeSandboxUrl: process.env.HOUSTON_CODE_SANDBOX_URL,
  };
  process.env.HOUSTON_CONTROL_PLANE_URL = "http://host.local";
  process.env.HOUSTON_SANDBOX_TOKEN = "sandbox-token";
  process.env.HOUSTON_CODE_SANDBOX_URL = "http://sandbox.local";
  try {
    vi.resetModules();
    await import("./conversation-cache");
    const open = {
      tools: [...captured.tools],
      customTools: [...captured.customTools],
    };
    expect(unregistered(open.tools, open.customTools)).toEqual([]);
    expect(open.tools).toEqual(
      expect.arrayContaining([
        "suggest_actions",
        "save_routine",
        "save_learning",
        "list_agents",
        "read_agent",
        "run_code",
        "integration_search",
        "integration_execute",
        "request_connection",
        "custom_integration_detect",
        "custom_integration_add",
        "custom_integration_remove",
        "request_credential",
      ]),
    );
  } finally {
    restoreEnv("HOUSTON_CONTROL_PLANE_URL", prior.controlPlane);
    restoreEnv("HOUSTON_SANDBOX_TOKEN", prior.sandboxToken);
    restoreEnv("HOUSTON_CODE_SANDBOX_URL", prior.codeSandboxUrl);
  }
});

async function reimportWithAssistantEnv(assistant: {
  HOUSTON_ASSISTANT_ROLE?: string;
  HOUSTON_ASSISTANT_CP_URL?: string;
  HOUSTON_ASSISTANT_TOKEN?: string;
}): Promise<{ tools: string[]; customTools: string[] }> {
  const keys = [
    "HOUSTON_CONTROL_PLANE_URL",
    "HOUSTON_SANDBOX_TOKEN",
    "HOUSTON_ASSISTANT_ROLE",
    "HOUSTON_ASSISTANT_CP_URL",
    "HOUSTON_ASSISTANT_TOKEN",
  ] as const;
  const prior = new Map(keys.map((k) => [k, process.env[k]]));
  process.env.HOUSTON_CONTROL_PLANE_URL = "http://host.local";
  process.env.HOUSTON_SANDBOX_TOKEN = "sandbox-token";
  delete process.env.HOUSTON_ASSISTANT_ROLE;
  delete process.env.HOUSTON_ASSISTANT_CP_URL;
  delete process.env.HOUSTON_ASSISTANT_TOKEN;
  for (const [k, v] of Object.entries(assistant)) process.env[k] = v;
  try {
    vi.resetModules();
    await import("./conversation-cache");
    return {
      tools: [...captured.tools],
      customTools: [...captured.customTools],
    };
  } finally {
    for (const k of keys) restoreEnv(k, prior.get(k));
  }
}

test("pi registers the assistant family for the coordinator", async () => {
  const { ASSISTANT_TOOL_NAMES } = await import("./tools/assistant");
  const open = await reimportWithAssistantEnv({
    HOUSTON_ASSISTANT_ROLE: "coordinator",
  });
  expect(unregistered(open.tools, open.customTools)).toEqual([]);
  expect(open.tools).toEqual(expect.arrayContaining([...ASSISTANT_TOOL_NAMES]));
  expect(open.customTools).toEqual(
    expect.arrayContaining([...ASSISTANT_TOOL_NAMES]),
  );
  for (const name of [
    "request_connection",
    "request_credential",
    "request_provider_connection",
  ]) {
    expect(open.tools).toContain(name);
    expect(open.customTools).toContain(name);
  }
  expect(open.tools).toContain("houston_recall");
  expect(open.customTools).toContain("houston_recall");
  expect(open.tools).not.toContain("bash");
  expect(open.customTools).not.toContain("bash");
  expect(open.tools).not.toContain("list_agents");
  expect(open.customTools).not.toContain("read_agent");
});

test.each([
  [
    "a gateway pair in its environment",
    {
      HOUSTON_ASSISTANT_CP_URL: "https://gateway.test",
      HOUSTON_ASSISTANT_TOKEN: "gw-token",
    },
  ],
  ["a misspelled role", { HOUSTON_ASSISTANT_ROLE: "assistant" }],
  ["an empty role", { HOUSTON_ASSISTANT_ROLE: "" }],
  ["no role at all", {}],
])("the assistant family stays off with %s", async (_label, assistant) => {
  const { ASSISTANT_TOOL_NAMES } = await import("./tools/assistant");
  const partial = await reimportWithAssistantEnv(assistant);
  for (const name of ASSISTANT_TOOL_NAMES) {
    expect(partial.tools).not.toContain(name);
    expect(partial.customTools).not.toContain(name);
  }
  expect(partial.tools).toEqual(expect.arrayContaining(["save_routine"]));
});

test("the assistant family stays absent when the deployment did not opt in", async () => {
  const { ASSISTANT_TOOL_NAMES } = await import("./tools/assistant");
  for (const name of ASSISTANT_TOOL_NAMES) {
    expect(base.tools).not.toContain(name);
    expect(base.customTools).not.toContain(name);
  }
});

test("pi registers the browser for an ordinary agent, never for the coordinator", async () => {
  expect(base.tools).toContain("browser");
  expect(base.customTools).toContain("browser");
  const coordinator = await reimportWithAssistantEnv({
    HOUSTON_ASSISTANT_ROLE: "coordinator",
  });
  expect(coordinator.tools).not.toContain("browser");
  expect(coordinator.customTools).not.toContain("browser");
});
