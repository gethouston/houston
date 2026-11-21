import { readEmbeddedCatalog } from "@houston/host/src/assistant/catalog-source";
import { expect, test } from "vitest";
import { COORDINATOR_TOOL_NAMES } from "../../session/tool-selection";
import { httpSandboxFetch } from "../../session/tools/sandbox-fetch";
import { buildBridgedToolSet } from "./mcp-tool-set";

const catalog = readEmbeddedCatalog();
if (!catalog) throw new Error("the embedded assistant catalog is unreadable");

const call = httpSandboxFetch("http://host.local", "token");

const NOT_BRIDGED_IN_EXECUTE = new Set(["read", "write", "plan_ready"]);

const registered = (mode: "execute" | "plan" | "auto"): string[] =>
  buildBridgedToolSet({
    integrations: { call },
    assistant: { catalog, call },
    personalAssistant: true,
    mode,
  }).map((tool) => tool.name);

test("the coordinator's registered MCP tools are exactly its allowed set", () => {
  const expected = COORDINATOR_TOOL_NAMES.filter(
    (name) => !NOT_BRIDGED_IN_EXECUTE.has(name),
  );
  expect(new Set(registered("execute"))).toEqual(new Set(expected));
});

test("no working tool reaches the coordinator, in any mode", () => {
  const forbidden = [
    "save_routine",
    "integration_search",
    "integration_execute",
    "bash",
    "run_code",
  ];
  for (const mode of ["execute", "plan", "auto"] as const) {
    const names = registered(mode);
    for (const name of forbidden) expect(names, mode).not.toContain(name);
    for (const name of names)
      expect(COORDINATOR_TOOL_NAMES, mode).toContain(name);
  }
});

test("plan is the only mode that offers plan_ready", () => {
  expect(registered("plan")).toContain("plan_ready");
  expect(registered("execute")).not.toContain("plan_ready");
  expect(registered("auto")).not.toContain("plan_ready");
});

test("secure connection cards survive execute and auto, never plan", () => {
  for (const name of [
    "request_connection",
    "request_credential",
    "request_provider_connection",
  ]) {
    expect(registered("execute")).toContain(name);
    expect(registered("auto")).toContain(name);
    expect(registered("plan")).not.toContain(name);
  }
});
