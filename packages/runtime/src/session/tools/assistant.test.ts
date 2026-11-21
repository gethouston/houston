import type { ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import type { AssistantCatalog } from "@houston/host/src/assistant/catalog";
import { afterEach, expect, test, vi } from "vitest";
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

const CTX = {} as ExtensionToolContext;
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

afterEach(() => {
  vi.unstubAllEnvs();
});

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

test("houston_capabilities omits what this Houston cannot perform", async () => {
  vi.stubEnv("HOUSTON_ASSISTANT_UNSERVED", "listRoutines");
  const result = await capabilities.execute(
    "c1",
    { query: "routines" },
    undefined,
    undefined,
    CTX,
  );
  expect(text(result)).not.toContain("listRoutines");
});

test("houston_describe says plainly that it cannot be done here", async () => {
  vi.stubEnv("HOUSTON_ASSISTANT_UNSERVED", "listRoutines");
  const result = await describe.execute(
    "d1",
    { operation: "listRoutines" },
    undefined,
    undefined,
    CTX,
  );
  expect(result.details).toMatchObject({
    ok: false,
    error: { code: "operation_unavailable_here" },
  });
  expect(text(result)).toContain("is not available here");
});

test("a withheld operation still reads as one that does not exist", async () => {
  vi.stubEnv("HOUSTON_ASSISTANT_UNSERVED", "rotateSecret");
  const result = await describe.execute(
    "d1",
    { operation: "rotateSecret" },
    undefined,
    undefined,
    CTX,
  );
  expect(result.details).toMatchObject({
    error: { code: "unknown_operation" },
  });
});

test("no stamp withholds nothing from either read tool", async () => {
  const listed = await capabilities.execute(
    "c1",
    { query: "routines" },
    undefined,
    undefined,
    CTX,
  );
  expect(text(listed)).toContain("listRoutines");
});
