import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AssistantCatalog } from "@houston/host/src/assistant/catalog";
import { expect, test } from "vitest";
import {
  ASSISTANT_TOOL_NAMES,
  HOUSTON_CALL_TOOL_NAME,
  HOUSTON_CAPABILITIES_TOOL_NAME,
  HOUSTON_DESCRIBE_TOOL_NAME,
  HOUSTON_RECALL_TOOL_NAME,
  makeAssistantCapabilitiesTool,
  makeAssistantDescribeTool,
  makeAssistantTools,
} from "./assistant";

/**
 * The catalog's READ tools. These pin what the agent is shown: the index
 * withholds schemas (they are `houston_describe`'s job and would flood the
 * context), withheld operations — hidden, or carrying no route this build can
 * dispatch — are absent from both, and a `confirm` operation announces itself
 * in both places so the model asks before it acts.
 */

const CTX = {} as ExtensionContext;
const call = (async () => new Response(null)) as never;

const catalog: AssistantCatalog = {
  version: 3,
  sourceHash: "fixture",
  operations: [
    {
      name: "listRoutines",
      group: "routines",
      description: "List an agent's scheduled routines.",
      confirm: false,
      hidden: false,
      params: [
        { name: "agentPath", required: true, schema: { type: "string" } },
      ],
      returns: { type: "array" },
      route: {
        method: "GET",
        path: "/v1/routines",
        pathParams: [],
        query: { agentPath: "agentPath" },
        body: null,
        bodyFields: null,
      },
    },
    {
      name: "deleteRoutine",
      group: "routines",
      description: "Delete a routine for good.",
      confirm: true,
      hidden: false,
      params: [
        { name: "agentPath", required: true, schema: { type: "string" } },
        { name: "id", required: true, schema: { type: "string" } },
      ],
      returns: { type: "null" },
      route: {
        method: "DELETE",
        path: "/v1/routines/{id}",
        pathParams: [{ name: "id", encoding: "segment" }],
        query: { agentPath: "agentPath" },
        body: null,
        bodyFields: null,
      },
    },
    {
      name: "listOrgs",
      group: "org",
      description: "The spaces the caller belongs to.",
      confirm: false,
      hidden: false,
      params: [],
      returns: { type: "object" },
      route: {
        method: "GET",
        path: "/v1/orgs",
        pathParams: [],
        query: {},
        body: null,
        bodyFields: null,
      },
    },
    {
      name: "rotateSecret",
      group: "internal",
      description: "Withheld entirely.",
      confirm: true,
      hidden: true,
      params: [],
      returns: { type: "null" },
      route: null,
    },
    // Visible in the generated catalog, but no route could be derived for it,
    // so this build cannot perform it: withheld exactly like a hidden one.
    {
      name: "exportLedger",
      group: "billing",
      description: "No route was derived for this one.",
      confirm: false,
      hidden: false,
      params: [],
      returns: { type: "null" },
      route: null,
    },
  ],
} as AssistantCatalog;

const opts = { catalog, call };
const capabilities = makeAssistantCapabilitiesTool(opts);
const describe = makeAssistantDescribeTool(opts);

const text = (result: { content: Array<{ type: string; text?: string }> }) =>
  result.content.map((c) => c.text ?? "").join("");

test("the family is exactly the four tools, in find/read/do/recall order", () => {
  expect(ASSISTANT_TOOL_NAMES).toEqual([
    HOUSTON_CAPABILITIES_TOOL_NAME,
    HOUSTON_DESCRIBE_TOOL_NAME,
    HOUSTON_CALL_TOOL_NAME,
    HOUSTON_RECALL_TOOL_NAME,
  ]);
  expect(makeAssistantTools(opts).map((t) => t.name)).toEqual([
    ...ASSISTANT_TOOL_NAMES,
  ]);
});

test("houston_capabilities with no arguments lists the groups and their counts", async () => {
  const result = await capabilities.execute(
    "c1",
    {},
    undefined,
    undefined,
    CTX,
  );
  expect(result.details).toEqual({ view: "groups", groups: 2, total: 3 });
  const body = text(result);
  expect(body).toContain("routines");
  expect(body).toContain("org");
  // A withheld operation's group must not even be named as a place to look —
  // whether it is withheld by policy (hidden) or unroutable in this build.
  expect(body).not.toContain("internal");
  expect(body).not.toContain("billing");
});

test("houston_capabilities searches names and descriptions without schemas", async () => {
  const result = await capabilities.execute(
    "c1",
    { query: "routine" },
    undefined,
    undefined,
    CTX,
  );
  expect(result.details).toEqual({
    view: "search",
    matched: 2,
    returned: 2,
    total: 3,
  });
  const body = text(result);
  expect(body).toContain("listRoutines");
  expect(body).toContain("deleteRoutine");
  // Schemas belong to houston_describe; the index carrying them would spend the
  // context the two-step lookup exists to save.
  expect(body).not.toContain("agentPath");
});

test("a search that matches nothing steers the agent on instead of dead-ending", async () => {
  const result = await capabilities.execute(
    "c1",
    { query: "launch a rocket" },
    undefined,
    undefined,
    CTX,
  );
  expect(text(result)).toContain("Nothing matched");
  expect(text(result)).toContain("see the groups");
});

test("houston_describe answers one operation's full contract", async () => {
  const result = await describe.execute(
    "d1",
    { operation: "listRoutines" },
    undefined,
    undefined,
    CTX,
  );
  expect(result.details).toEqual({ ok: true, operation: "listRoutines" });
  const body = text(result);
  expect(body).toContain("agentPath");
  expect(body).toContain("keyed by parameter name");
});

test("houston_describe warns on a confirm operation before it is ever called", async () => {
  const result = await describe.execute(
    "d1",
    { operation: "deleteRoutine" },
    undefined,
    undefined,
    CTX,
  );
  expect(text(result)).toContain("hard to undo");
  // The gate is Houston's, not the model's: the guidance must not suggest the
  // model has any way to declare an approval.
  expect(text(result)).toContain("needs_confirmation");
  expect(text(result)).not.toMatch(/confirmed true/i);
});

test.each([
  "rotateSecret",
  "exportLedger",
  "noSuchOperation",
])("houston_describe refuses %s as an unknown operation, without throwing", async (operation) => {
  const result = await describe.execute(
    "d1",
    { operation },
    undefined,
    undefined,
    CTX,
  );
  expect(result.details).toEqual({
    ok: false,
    operation,
    error: {
      code: "unknown_operation",
      message: expect.stringContaining(operation),
    },
  });
  expect(text(result)).toContain("ERROR unknown_operation");
});
