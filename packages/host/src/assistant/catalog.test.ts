import { describe, expect, test } from "vitest";
import {
  findVisibleOperation,
  parseAssistantCatalog,
  visibleOperations,
} from "./catalog";

/**
 * A FIXTURE catalog, never the generated one: these tests pin the parser's
 * contract (shape, version, hidden-withholding), which must not move when the
 * real catalog's 200-odd operations do.
 */
const fixture = {
  version: 3,
  sourceHash: "fixture",
  operations: [
    {
      name: "listRoutines",
      group: "routines",
      description: "List an agent's routines.",
      confirm: false,
      hidden: false,
      params: [
        { name: "agentPath", required: true, schema: { type: "string" } },
      ],
      returns: { type: "array" },
      route: {
        method: "GET",
        path: "/agents/{agentPath}/routines",
        pathParams: [{ name: "agentPath", encoding: "segment" }],
        query: {},
        body: null,
        bodyFields: null,
      },
    },
    {
      name: "rotateEngineSecret",
      group: "internal",
      description: "Withheld from the agent entirely.",
      confirm: true,
      hidden: true,
      params: [],
      returns: { type: "null" },
      route: null,
    },
  ],
};

/** The fixture document with the first operation's only parameter replaced. */
const withFirstParam = (param: Record<string, unknown>): string =>
  JSON.stringify({
    ...fixture,
    operations: [{ ...fixture.operations[0], params: [param] }],
  });

describe("parseAssistantCatalog", () => {
  test("accepts a well-formed version 3 document", () => {
    const catalog = parseAssistantCatalog(JSON.stringify(fixture));
    expect(catalog?.operations).toHaveLength(2);
    expect(catalog?.sourceHash).toBe("fixture");
  });

  test.each([
    ["unparseable JSON", "{not json"],
    ["a missing field", JSON.stringify({ version: 3, sourceHash: "x" })],
    ["a future version", JSON.stringify({ ...fixture, version: 4 })],
    [
      "an operation with no route field at all",
      JSON.stringify({
        ...fixture,
        operations: [{ ...fixture.operations[0], route: undefined }],
      }),
    ],
  ])("returns null for %s rather than throwing", (_label, body) => {
    expect(parseAssistantCatalog(body)).toBeNull();
  });

  // `description` / `source` are printed verbatim to the model, so the parsed
  // type may only claim they are strings if the envelope proved it.
  test("keeps a parameter's description and source when both are strings", () => {
    const annotated = withFirstParam({
      name: "agentPath",
      required: true,
      schema: { type: "string" },
      description: "The agent this acts on.",
      source: "listAgents",
    });
    const [param] =
      parseAssistantCatalog(annotated)?.operations[0]?.params ?? [];
    expect(param?.description).toBe("The agent this acts on.");
    expect(param?.source).toBe("listAgents");
  });

  test("returns null for a parameter whose source is not a string", () => {
    expect(
      parseAssistantCatalog(
        withFirstParam({
          name: "agentPath",
          required: true,
          schema: { type: "string" },
          source: 42,
        }),
      ),
    ).toBeNull();
  });
});

describe("visibility", () => {
  const catalog = parseAssistantCatalog(JSON.stringify(fixture));
  if (!catalog) throw new Error("fixture catalog must parse");

  test("hidden operations are withheld from the visible set", () => {
    expect(visibleOperations(catalog).map((op) => op.name)).toEqual([
      "listRoutines",
    ]);
  });

  test("a visible operation resolves by exact name", () => {
    expect(findVisibleOperation(catalog, "listRoutines")?.group).toBe(
      "routines",
    );
  });

  // Hidden must be indistinguishable from absent: resolving it to anything the
  // agent can see would turn the hidden set into a list of things to go find.
  test("a hidden operation is indistinguishable from an unknown one", () => {
    expect(findVisibleOperation(catalog, "rotateEngineSecret")).toBeUndefined();
    expect(findVisibleOperation(catalog, "noSuchOperation")).toBeUndefined();
  });
});
