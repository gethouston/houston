import { expect, test } from "vitest";
import { toolNamesForMode } from "../session/tool-selection";
import type { PiTurnRequest } from "./turn-session";
import { buildTurnHostTools, buildTurnToolSelection } from "./turn-toolset";

const base = (scopes?: PiTurnRequest["grant"]): PiTurnRequest => ({
  conversationId: "c1",
  text: "hello",
  provider: "openai",
  emit: () => undefined,
  signal: undefined,
  turnId: "t1",
  ...(scopes
    ? { grant: scopes, sandbox: { call: async () => Response.json({}) } }
    : {}),
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
    ],
  },
  {
    scopes: ["agent-writes"] as const,
    names: ["save_routine", "save_learning", "find_skills", "install_skill"],
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
