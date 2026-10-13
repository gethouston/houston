import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readEmbeddedCatalog } from "@houston/host/src/assistant/catalog-source";
import { afterEach, expect, test, vi } from "vitest";
import { toolNamesForMode } from "../session/tool-selection";
import {
  type CredentialToolsInput,
  credentialTools,
} from "../session/tools/credential-tools";
import { makeIntegrationTools } from "../session/tools/integrations";
import type { SandboxFetch } from "../session/tools/sandbox-fetch";
import type { TurnSessionRequest } from "./turn-session";
import {
  buildTurnCommonTools,
  buildTurnHostTools,
  buildTurnToolSelection,
  turnCodeExecution,
} from "./turn-toolset";

/** The turn's own transport: every host-proxying tool must ride THIS one. */
const call: SandboxFetch = async () => Response.json({});

const base = (scopes?: TurnSessionRequest["grant"]): TurnSessionRequest => ({
  conversationId: "c1",
  text: "hello",
  provider: "openai",
  emit: () => undefined,
  signal: undefined,
  turnId: "t1",
  ...(scopes ? { grant: scopes, sandbox: { call } } : {}),
});

function embeddedCatalog() {
  const catalog = readEmbeddedCatalog();
  if (!catalog) throw new Error("the embedded assistant catalog is unreadable");
  return catalog;
}

afterEach(() => {
  vi.doUnmock("../session/tools/credential-tools");
  vi.resetModules();
});

test.each([
  {
    scopes: ["integrations"] as const,
    names: [
      "integration_search",
      "integration_execute",
      "custom_integration_detect",
      "custom_integration_add",
      "custom_integration_remove",
      "request_credential",
      "request_provider_connection",
      "request_hands_on",
    ],
  },
  {
    scopes: ["agent-writes"] as const,
    names: [
      "save_routine",
      "save_learning",
      "request_provider_connection",
      "request_hands_on",
    ],
  },
])("$scopes gates both names and registered objects", ({ scopes, names }) => {
  const turn = base({ scopes: [...scopes] });
  const selected = buildTurnToolSelection(turn, "disabled").toolNames;
  const registered = buildTurnHostTools(turn).map((tool) => tool.name);
  for (const name of names) {
    expect(selected).toContain(name);
    expect(registered).toContain(name);
  }
});

test("an absent grant preserves the host-proxying all-off set", () => {
  const turn = base();
  const names = buildTurnToolSelection(turn, "disabled").toolNames;
  expect(names).toEqual([
    "read",
    "ls",
    "grep",
    "find",
    "edit",
    "write",
    "ask_user",
    "suggest_reusable",
    "suggest_actions",
  ]);
  expect(buildTurnHostTools(turn)).toEqual([]);
});

test("plan mode strips granted acting and write tools", () => {
  const turn = base({ scopes: ["integrations", "agent-writes"] });
  const selected = buildTurnToolSelection(turn, "disabled").toolNames;
  expect(toolNamesForMode("plan", selected)).toEqual([
    "read",
    "ls",
    "grep",
    "find",
    "ask_user",
    "plan_ready",
  ]);
});

// The three backends must offer the SAME secure key-entry surface for the same
// runtime: an agent that can ask for a key on one and not on another is the
// same agent behaving differently for reasons the user cannot see. These pin
// the turn path to `credentialTools`' answer rather than to today's tool list.
test("an agent turn registers exactly the shared credential surface", () => {
  const turn = base({ scopes: ["integrations"] });
  expect(buildTurnHostTools(turn).map((tool) => tool.name)).toEqual([
    "request_provider_connection",
    "request_hands_on",
    ...makeIntegrationTools({ call }).map((tool) => tool.name),
    ...credentialTools({
      personalAssistant: false,
      integrations: { call },
    }).map((tool) => tool.name),
  ]);
});

test("a coordinator turn registers the coordinator credential tool", () => {
  const catalog = embeddedCatalog();
  const turn: TurnSessionRequest = {
    ...base({ scopes: ["agent-writes"] }),
    role: "coordinator",
  };
  const registered = buildTurnCommonTools(turn, null, {
    dataDir: mkdtempSync(join(tmpdir(), "toolset-")),
    workspaceDir: mkdtempSync(join(tmpdir(), "toolset-ws-")),
  }).map((tool) => tool.name);
  for (const name of credentialTools({
    personalAssistant: true,
    assistant: { catalog, call },
  }).map((tool) => tool.name)) {
    expect(registered).toContain(name);
  }
  expect(registered).toContain("request_connection");
  expect(registered).not.toContain("custom_integration_add");
  expect(registered).not.toContain("integration_execute");
});

test("an agent turn binds the credential surface to its own transport", async () => {
  const seen: CredentialToolsInput[] = [];
  vi.resetModules();
  vi.doMock("../session/tools/credential-tools", () => ({
    credentialTools: (input: CredentialToolsInput) => {
      seen.push(input);
      return [];
    },
  }));
  const isolated = await import("./turn-toolset");
  isolated.buildTurnHostTools(base({ scopes: ["integrations"] }));
  expect(seen).toHaveLength(1);
  expect(seen[0]?.personalAssistant).toBe(false);
  expect(seen[0]?.integrations?.call).toBe(call);
});

// --- run_code rides the code-run scope ---------------------------------------

test("remote + the code-run scope puts run_code on the list", () => {
  const turn = base({ scopes: ["code-run"] });
  const selection = buildTurnToolSelection(turn, "remote");
  expect(selection.includeRunCode).toBe(true);
  expect(selection.toolNames).toContain("run_code");
  expect(turnCodeExecution(turn, "remote")).toBe("remote");
});

test("remote WITHOUT the scope runs the turn with code execution disabled", () => {
  // The worker may be configured for remote, but only the gateway can relay
  // the run route: a tool that 404s on every call is worse than no tool, and
  // the system prompt is built from the same answer (turn-session-startup.ts).
  const turn = base({ scopes: ["integrations"] });
  const selection = buildTurnToolSelection(turn, "remote");
  expect(selection.includeRunCode).toBe(false);
  expect(selection.toolNames).not.toContain("run_code");
  expect(turnCodeExecution(turn, "remote")).toBe("disabled");
});

test("a code-run scope on a turn with no sandbox grants nothing", () => {
  // No facade = no transport; the scope alone can never admit the tool.
  const turn: TurnSessionRequest = {
    ...base(),
    grant: { scopes: ["code-run"] },
  };
  expect(buildTurnToolSelection(turn, "remote").includeRunCode).toBe(false);
  expect(turnCodeExecution(turn, "remote")).toBe("disabled");
});

test.each([
  "local",
  "disabled",
] as const)("%s is the worker's own answer — the scope does not change it", (mode) => {
  const turn = base({ scopes: ["code-run"] });
  expect(turnCodeExecution(turn, mode)).toBe(mode);
  expect(turnCodeExecution(base({ scopes: ["integrations"] }), mode)).toBe(
    mode,
  );
});
