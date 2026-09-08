import { ASSISTANT_CAPABILITY_INDEX } from "@houston/domain/assistant-capability-index";
import { readEmbeddedCatalog } from "@houston/host/src/assistant/catalog-source";
import { expect, test } from "vitest";
import { buildBridgedToolSet } from "../src/backends/claude/mcp-tool-set";
import { buildAssistantRulesSection } from "../src/session/assistant-rules-context";
import { httpSandboxFetch } from "../src/session/tools/sandbox-fetch";
import { DISCOVERABILITY_CASES } from "./discoverability-cases";

/**
 * THE CI HALF of the discoverability eval: everything that can be proved
 * without a model.
 *
 * The model half (`pnpm eval:assistant`) answers "does the assistant FIND the
 * operation"; it needs a credential and real tokens, so it stays opt-in. What
 * runs here is the half that would make that eval meaningless if it broke: the
 * operations the fixtures expect must still exist and still be visible, the map
 * the assistant reads must still name them, and the loop that tells it to
 * search before refusing must still be in the prompt. A renamed or newly hidden
 * operation fails the build instead of quietly turning a fixture into an
 * impossible request.
 */

const catalog = readEmbeddedCatalog();
if (!catalog) throw new Error("the embedded assistant catalog is unreadable");

const visible = new Set(
  catalog.operations.filter((op) => !op.hidden).map((op) => op.name),
);

const section = buildAssistantRulesSection("coordinator") ?? "";

test("every case is either an operation to find or a refusal to make", () => {
  const ids = DISCOVERABILITY_CASES.map((one) => one.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(DISCOVERABILITY_CASES.length).toBeGreaterThanOrEqual(30);
  for (const one of DISCOVERABILITY_CASES) {
    expect(one.request.trim().length, one.id).toBeGreaterThan(0);
    if (one.operations.length === 0) expect(one.refusal, one.id).toBeTruthy();
    else expect(one.refusal, one.id).toBeUndefined();
  }
});

test("every operation a fixture expects exists and is visible", () => {
  // The incident in one assertion: a fixture naming an operation the assistant
  // can no longer see is a request the user will be told is impossible.
  for (const one of DISCOVERABILITY_CASES) {
    for (const operation of one.operations) {
      expect(visible.has(operation), `${one.id} -> ${operation}`).toBe(true);
    }
  }
});

test("the capability map names every visible operation", () => {
  // The map is what removes "I did not know it existed" from the loop, so it
  // has to be the WHOLE surface, not a curated excerpt of it.
  for (const operation of visible) {
    expect(ASSISTANT_CAPABILITY_INDEX, operation).toContain(operation);
  }
  expect(section).toContain(ASSISTANT_CAPABILITY_INDEX);
});

test("the always-on rules carry the mandatory loop", () => {
  const mandatory = [
    "not technical",
    "no operation names",
    "Restate the outcome",
    "search houston_capabilities",
    "NEVER tell them something cannot be done until that search comes back empty",
    "Houston cannot do that yet",
    "wait for their answer",
    "ask which one they mean",
    "houston_describe",
    "Report what actually happened",
  ];
  for (const line of mandatory) expect(section).toContain(line);
});

test("no tool the assistant is offered describes itself with an em dash", () => {
  // Every tool description is read back to a non-technical user in the model's
  // own words; an em dash there ends up in Houston's copy, which the product
  // forbids everywhere else.
  const call = httpSandboxFetch("http://host.local", "token");
  const tools = buildBridgedToolSet({
    integrations: { call },
    assistant: { catalog, call },
    personalAssistant: true,
    mode: "execute",
  });
  expect(tools.length).toBeGreaterThan(0);
  for (const tool of tools) {
    expect(tool.description, tool.name).not.toContain("—");
    expect(JSON.stringify(tool.parameters), tool.name).not.toContain("—");
  }
});

test("no catalogued operation describes itself with an em dash", () => {
  for (const operation of catalog.operations) {
    expect(operation.description, operation.name).not.toContain("—");
    for (const param of operation.params) {
      expect(param.description ?? "", operation.name).not.toContain("—");
    }
  }
});
