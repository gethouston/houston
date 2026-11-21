import { ASSISTANT_CAPABILITY_INDEX } from "@houston/domain/assistant-capability-index";
import { isCallableOperation } from "@houston/domain/assistant-catalog-callable";
import { readEmbeddedCatalog } from "@houston/host/src/assistant/catalog-source";
import { expect, test } from "vitest";
import { buildBridgedToolSet } from "../src/backends/claude/mcp-tool-set";
import { buildAssistantRulesSection } from "../src/session/assistant-rules-context";
import { httpSandboxFetch } from "../src/session/tools/sandbox-fetch";
import { DISCOVERABILITY_CASES } from "./discoverability-cases";

const catalog = readEmbeddedCatalog();
if (!catalog) throw new Error("the embedded assistant catalog is unreadable");

const visible = new Set(
  catalog.operations.filter((op) => !op.hidden).map((op) => op.name),
);
const callable = new Set(
  catalog.operations.filter(isCallableOperation).map((op) => op.name),
);

const section = buildAssistantRulesSection("coordinator") ?? "";

function mapNames(operation: string): boolean {
  const escaped = operation.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\w.])${escaped}(?![\\w.])`).test(
    ASSISTANT_CAPABILITY_INDEX,
  );
}

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
  for (const one of DISCOVERABILITY_CASES) {
    for (const operation of one.operations) {
      expect(visible.has(operation), `${one.id} -> ${operation}`).toBe(true);
    }
  }
});

test("the capability map names every callable operation and no other", () => {
  for (const operation of callable) {
    expect(mapNames(operation), operation).toBe(true);
  }
  for (const operation of visible) {
    if (callable.has(operation)) continue;
    expect(mapNames(operation), operation).toBe(false);
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
    "say plainly that you cannot do that yet",
    "wait for their answer",
    "ask which one they mean",
    "houston_describe",
    "Report what actually happened",
  ];
  for (const line of mandatory) expect(section).toContain(line);
});

test("no tool the assistant is offered describes itself with an em dash", () => {
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
