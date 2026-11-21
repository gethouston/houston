import { describe, expect, test } from "vitest";
import { ASSISTANT_CATALOG_VERSION, findVisibleOperation } from "./catalog";
import { processAssistantCatalog, readEmbeddedCatalog } from "./catalog-source";

const fixture = {
  version: ASSISTANT_CATALOG_VERSION,
  sourceHash: "fixture",
  operations: [
    {
      name: "listRoutines",
      group: "routines",
      description: "List an agent's routines.",
      confirm: false,
      hidden: false,
      params: [{ name: "agentPath", required: true, schema: {} }],
      returns: {},
      route: {
        method: "GET",
        path: "/agents/{agentPath}/routines",
        pathParams: [{ name: "agentPath", encoding: "segment" }],
        query: {},
        body: null,
        bodyFields: null,
      },
    },
  ],
};

describe("the embedded catalog", () => {
  test("carries the generated operation set", () => {
    const catalog = readEmbeddedCatalog();
    if (!catalog) throw new Error("the embedded catalog must load");
    expect(catalog.version).toBe(ASSISTANT_CATALOG_VERSION);
    expect(catalog.sourceHash).not.toBe("");
    expect(catalog.operations.length).toBeGreaterThanOrEqual(100);
    expect(
      catalog.operations.filter((op) => op.route !== null).length,
    ).toBeGreaterThanOrEqual(90);
  });

  test("resolves a routable operation the dispatcher can address", () => {
    const catalog = readEmbeddedCatalog();
    if (!catalog) throw new Error("the embedded catalog must load");
    const operation = findVisibleOperation(catalog, "listRoutines");
    expect(operation?.route?.method).toBe("GET");
  });

  test("is read once and shared by every caller", () => {
    expect(processAssistantCatalog()).toBe(processAssistantCatalog());
    expect(processAssistantCatalog()?.operations.length).toBe(
      readEmbeddedCatalog()?.operations.length,
    );
  });
});

describe("the envelope guard", () => {
  test("accepts a well-formed document", () => {
    expect(readEmbeddedCatalog(fixture)?.operations).toHaveLength(1);
  });

  test.each([
    ["a version this build does not read", { ...fixture, version: 4 }],
    ["a missing field", { version: ASSISTANT_CATALOG_VERSION }],
    [
      "an operation with no route field at all",
      {
        ...fixture,
        operations: [{ ...fixture.operations[0], route: undefined }],
      },
    ],
  ])("refuses %s with one named log line", (_label, document) => {
    const logged: string[] = [];
    expect(readEmbeddedCatalog(document, (m) => logged.push(m))).toBeNull();
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain("gen:assistant-catalog");
  });
});
