import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  ASSISTANT_CATALOG_VERSION,
  findVisibleOperation,
  loadAssistantCatalog,
  parseAssistantCatalog,
  visibleOperations,
} from "./catalog";
import { DEFAULT_ASSISTANT_CATALOG_PATH } from "./catalog-source";

/**
 * A FIXTURE catalog, never the generated one: these tests pin the loader's
 * contract (shape, version, hidden-withholding, missing-file tolerance), which
 * must not move when the real catalog's 200-odd operations do.
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

const write = (body: string): string => {
  const path = join(
    mkdtempSync(join(tmpdir(), "assistant-catalog-")),
    "c.json",
  );
  writeFileSync(path, body);
  return path;
};

/** The single line a failed load must say, or a failure naming what it said instead. */
function loggedOnce(run: (log: (message: string) => void) => unknown): string {
  const messages: string[] = [];
  expect(run((message) => messages.push(message))).toBeNull();
  const [only, ...rest] = messages;
  if (only === undefined || rest.length > 0) {
    throw new Error(`expected one log line, got ${messages.length}`);
  }
  return only;
}

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
});

describe("loadAssistantCatalog", () => {
  test("reads a catalog from disk", () => {
    const catalog = loadAssistantCatalog(write(JSON.stringify(fixture)));
    expect(catalog?.operations).toHaveLength(2);
  });

  // A deployment that packaged no catalog is a NORMAL state (the family simply
  // stays off), so this must never be the thing that fails a boot.
  test("an absent file disables the family with one named log line", () => {
    const missing = join(
      tmpdir(),
      "assistant-catalog-does-not-exist",
      "c.json",
    );
    const message = loggedOnce((log) => loadAssistantCatalog(missing, log));
    expect(message).toContain(missing);
    expect(message).toContain("HOUSTON_ASSISTANT_CATALOG");
  });

  test("a malformed file disables the family with one named log line", () => {
    const path = write("{not json");
    const message = loggedOnce((log) => loadAssistantCatalog(path, log));
    expect(message).toContain("gen:assistant-catalog");
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

/**
 * The one place the FIXTURE contract is checked against reality: that the
 * generator and this loader still agree on the envelope, and that the default
 * path genuinely points at the file every image is expected to package. Counts
 * are floors, not equalities — the catalog grows with the client.
 */
describe("the generated catalog", () => {
  test("parses through the loader at the default path", () => {
    const catalog = loadAssistantCatalog(DEFAULT_ASSISTANT_CATALOG_PATH);
    if (!catalog) throw new Error("the generated catalog must load");
    expect(catalog.version).toBe(ASSISTANT_CATALOG_VERSION);
    expect(catalog.operations.length).toBeGreaterThanOrEqual(100);
    expect(
      catalog.operations.filter((op) => op.route !== null).length,
    ).toBeGreaterThanOrEqual(90);
  });
});
