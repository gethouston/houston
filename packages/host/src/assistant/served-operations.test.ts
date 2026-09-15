import { describe, expect, test } from "vitest";
import type { RouteDescriptor } from "../routes/registry";
import type { AssistantCatalog } from "./catalog";
import { processAssistantCatalog } from "./catalog-source";
import { operationProbePath, unservedOperations } from "./served-operations";

const loaded = processAssistantCatalog();
if (!loaded) throw new Error("the embedded assistant catalog must load");
const catalog: AssistantCatalog = loaded;

/** The route one named catalog operation calls. */
function routeOf(name: string) {
  const route = catalog.operations.find((op) => op.name === name)?.route;
  if (!route) throw new Error(`${name} carries no route`);
  return route;
}

const descriptor = (method: string, path: string): RouteDescriptor =>
  ({
    method,
    path,
    classification: "sdk",
    phase: "user",
    source: "test",
    group: "account",
  }) as RouteDescriptor;

describe("the probe path one operation would call", () => {
  test("a segment parameter becomes exactly one segment", () => {
    // `/agents/{agentId}/activities` — the agent reference is escaped whole by
    // the dispatcher, so it occupies one segment however the user spells it.
    expect(
      operationProbePath(routeOf("listActivities")).split("/"),
    ).toHaveLength(4);
    expect(operationProbePath(routeOf("listActivities"))).not.toContain("{");
  });

  test("a path parameter keeps its separators", () => {
    // `readAgentFile` takes a relative path, whose `/` survives into the URL:
    // a probe that collapsed it to one segment would miss a `*rest` route that
    // genuinely serves it and report the operation as unserved.
    const route = routeOf("readAgentFile");
    expect(route.pathParams.some((p) => p.encoding === "path")).toBe(true);
    const path = operationProbePath(route);
    expect(path).not.toContain("{");
    expect(
      path.split("/").length,
      "a path parameter contributes more than one segment",
    ).toBeGreaterThan(route.path.split("/").length);
  });

  test("every catalog route resolves to a concrete path", () => {
    const unresolved = catalog.operations
      .filter((op) => op.route && operationProbePath(op.route).includes("{"))
      .map((op) => op.name);
    expect(unresolved).toEqual([]);
  });
});

describe("what a route table says this host cannot do", () => {
  test("an empty table serves nothing routable", () => {
    const routable = catalog.operations.filter((op) => op.route !== null);
    // Minus the one operation a family answers from an owned subtree, which
    // publishes no descriptor to match against in the first place.
    expect(unservedOperations(catalog, []).length).toBe(routable.length - 1);
  });

  test("matching is structural, not by pattern spelling", () => {
    // The catalog says `{agentId}` where the registry says `:agentId`, and
    // `{id}` where it says `:routineId`. String equality would call this
    // unserved; the matcher must not.
    const routes = [
      descriptor("DELETE", "/agents/:agentId/routines/:routineId"),
    ];
    expect(unservedOperations(catalog, routes)).not.toContain("deleteRoutine");
  });

  test("the method has to match too", () => {
    const routes = [descriptor("GET", "/agents/:agentId/routines/:routineId")];
    expect(unservedOperations(catalog, routes)).toContain("deleteRoutine");
  });

  test("the answer is sorted, so a stamped list is stable across boots", () => {
    const names = unservedOperations(catalog, []);
    expect(names).toEqual([...names].sort());
  });
});
