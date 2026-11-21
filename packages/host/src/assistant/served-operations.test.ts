import { describe, expect, test } from "vitest";
import type { RouteDescriptor } from "../routes/registry";
import type { AssistantCatalog } from "./catalog";
import { processAssistantCatalog } from "./catalog-source";
import { operationProbePath, unservedOperations } from "./served-operations";

const loaded = processAssistantCatalog();
if (!loaded) throw new Error("the embedded assistant catalog must load");
const catalog: AssistantCatalog = loaded;

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
    expect(
      operationProbePath(routeOf("listActivities")).split("/"),
    ).toHaveLength(4);
    expect(operationProbePath(routeOf("listActivities"))).not.toContain("{");
  });

  test("a path parameter keeps its separators", () => {
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
    expect(unservedOperations(catalog, []).length).toBe(routable.length - 1);
  });

  test("matching is structural, not by pattern spelling", () => {
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
