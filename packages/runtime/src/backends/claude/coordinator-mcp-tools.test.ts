import { readEmbeddedCatalog } from "@houston/host/src/assistant/catalog-source";
import { expect, test } from "vitest";
import { COORDINATOR_TOOL_NAMES } from "../../session/tool-selection";
import { httpSandboxFetch } from "../../session/tools/sandbox-fetch";
import { buildBridgedToolSet } from "./mcp-tool-set";

/**
 * WHAT THE COORDINATOR ACTUALLY GETS on the Claude backend.
 *
 * A live runtime log listed `save_routine`, `find_skills`, `install_skill`,
 * `integration_execute` and `request_connection` among the assistant's
 * registered MCP tools - tools the coordinator is not allowed to have, because
 * every one of them does WORK, and work belongs on an agent's board where the
 * user can see it. The clamp exists (`buildBridgedToolSet` filters to
 * {@link COORDINATOR_TOOL_NAMES}); what was missing was a test that the
 * registered set is exactly the allowed one, so a tool added to the built list
 * can never quietly reach the assistant again.
 */

const catalog = readEmbeddedCatalog();
if (!catalog) throw new Error("the embedded assistant catalog is unreadable");

const call = httpSandboxFetch("http://host.local", "token");

/**
 * The three coordinator names that are never MCP tools: `read`/`write` are the
 * SDK's own built-ins (the Claude backend clamps them in its permission gate,
 * not through this bridge), and `plan_ready` exists only on a plan turn.
 */
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
  // The exact names the stale log carried. Every one of them DOES work.
  const forbidden = [
    "save_routine",
    "find_skills",
    "install_skill",
    "integration_search",
    "integration_execute",
    "request_connection",
    "request_credential",
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
