import { isCallableOperation } from "@houston/domain/assistant-catalog-callable";
import { describe, expect, it } from "vitest";
import { extractCatalog } from "../scripts/assistant-extractor.ts";
import { coverageViolations } from "../scripts/assistant-gate.ts";
import {
  renderCapabilityIndex,
  renderCatalog,
} from "../scripts/assistant-render.ts";
import {
  fixtureOptions,
  realOptions,
  route,
  segments,
} from "./assistant-catalog-support.ts";
import { OPERATION_POLICY_FLOOR } from "./fixtures/operation-policy-floor.ts";
import {
  CALLABLE_OPERATION_FLOOR,
  PUBLISHED_OPERATION_FLOOR,
} from "./fixtures/published-operation-floor.ts";

const result = extractCatalog(fixtureOptions);
const named = (name: string) =>
  result.catalog.operations.find((operation) => operation.name === name);

describe("assistant catalog extraction", () => {
  it("stamps the envelope of the live-adapter catalog", () => {
    expect(result.catalog.version).toBe(3);
    expect(result.catalog.$comment).toContain("FULL host path");
  });

  it("publishes exported functions and public mixin methods, nothing else", () => {
    expect(result.catalog.operations.map(({ name }) => name).sort()).toEqual([
      "allThings",
      "branchedThing",
      "createThing",
      "deleteAgentFileEntry",
      "deleteThing",
      "gadgets.detachAll",
      "gadgets.listFirst",
      "gadgets.probeFirst",
      "gadgets.seek",
      "gadgets.stamp",
      "gadgets.stray",
      "getThing",
      "getThingContext",
      "headThing",
      "integrationThings",
      "listAgentFiles",
      "listAgentThings",
      "listShadowThings",
      "listThings",
      "probeThing",
      "pushCredential",
      "readAgentFileEntry",
      "readThingFile",
      "replaceThing",
      "tagThing",
      "thingUsage",
      "things.audit",
      "things.count",
      "things.detach",
      "things.inspect",
      "things.pin",
      "things.readLoose",
      "things.rename",
      "things.scrap",
      "things.unpin",
      "things.writes.detach",
      "updateThing",
    ]);
  });

  it("composes a sub-client's path with the root its client is bound to", () => {
    // The literal lives in the sub-client, the values in the module method,
    // and `/agents/<id>` comes from the client the module resolved.
    // Both bodies do nothing but return the call, so a caller driving the
    // route directly gets exactly what the operation would have returned.
    expect(named("things.inspect")?.route).toEqual(
      route("/agents/{agentId}/gadgets/{id}", {
        pathParams: segments("agentId", "id"),
      }),
    );
    expect(named("things.rename")?.route).toEqual(
      route("/v1/widgets/{id}", {
        method: "PATCH",
        pathParams: segments("id"),
        bodyFields: { name: "name" },
      }),
    );
  });

  it("reads a path name through the body's own const, never the module's", () => {
    // `scrapThing` declares `const KIND = "gadgets"` over the module's
    // `const KIND = "widgets"`, and the body is what runs.
    expect(named("things.scrap")?.route).toEqual(
      route("/v1/gadgets/{id}", {
        method: "DELETE",
        pathParams: segments("id"),
        rawResponse: true,
      }),
    );
  });

  it("names an overloaded operation's parameters from its first signature", () => {
    // The implementation signature is written for the body (`a, b?`); a caller
    // sees `pin(id)`. Routing still reads the implementation, which is why the
    // operation is published at all - with its body's unroutable reason.
    expect(named("things.pin")?.params).toEqual([
      { name: "id", required: true, schema: { type: "string" } },
    ]);
    expect(named("things.pin")?.route).toBeNull();
  });

  it("answers with what the CLIENT method returns, not the wrapper", () => {
    // `count` declares `Promise<void>` because it publishes what it read; the
    // route answers the client method's own shape, and that is what a caller
    // driving the route directly receives.
    expect(named("things.count")?.returns).toMatchObject({
      type: "object",
      properties: {
        total: { type: "number" },
        // `(string & {})` is a string, not the String prototype's methods.
        kind: {
          anyOf: [
            { const: "widget", type: "string" },
            { const: "gadget", type: "string" },
            { type: "string" },
          ],
        },
      },
    });
  });

  it("refuses a destructured default once the caller can override it", () => {
    expect(named("things.unpin")?.route).toBeNull();
    expect(
      result.coverage.unroutable.find(({ name }) => name === "things.unpin")
        ?.reason,
    ).toBe("path segment depends on a value the caller may override");
  });

  it("carries a default the caller left untouched into the path", () => {
    expect(named("things.detach")?.route).toEqual(
      route("/v1/widgets/detach", {
        method: "POST",
        bodyFields: { kind: "kind" },
        rawResponse: true,
      }),
    );
  });

  it("refuses the same default once the caller can override it", () => {
    expect(named("things.writes.detach")?.route).toBeNull();
    expect(
      result.coverage.unroutable.find(
        ({ name }) => name === "things.writes.detach",
      )?.reason,
    ).toBe("path segment depends on a value the caller may override");
  });

  it("reports an unresolvable hop instead of dropping the operation", () => {
    expect(named("things.readLoose")?.route).toBeNull();
    expect(
      result.coverage.unroutable.find(({ name }) => name === "things.readLoose")
        ?.reason,
    ).toBe(
      "hop into AgentThingsClient.readThing could not be resolved: the agent the client is rooted at is not a parameter",
    );
  });

  it("publishes the VISIBLE twin of a shared route, whatever was read first", () => {
    // `gadgets` is mounted first, so the hidden `tally` reaches the route
    // before `things.count` does. Order must not decide which name a caller
    // can dispatch.
    expect(named("gadgets.tally")).toBeUndefined();
    expect(named("things.count")?.route?.path).toBe("/v1/widgets/count");
  });

  it("fails the gate when two SDK names tie on one route, naming both", () => {
    const conflicts = coverageViolations(result.annotations).filter(
      ({ rule }) => rule === "route-conflict",
    );
    expect(
      conflicts.map(({ name, problem }) => [name, problem]).sort(),
    ).toEqual([
      [
        "gadgets.listFirst",
        "`GET /v1/widgets` is claimed by this and by gadgets.listSecond, and visibility does not settle which one the catalog publishes.",
      ],
      [
        "gadgets.listSecond",
        "`GET /v1/widgets` is claimed by this and by gadgets.listFirst, and visibility does not settle which one the catalog publishes.",
      ],
      [
        "gadgets.probeFirst",
        "`GET /agents/{agentId}/probes/{id}` is claimed by this and by gadgets.probeSecond, and visibility does not settle which one the catalog publishes.",
      ],
      [
        "gadgets.probeSecond",
        "`GET /agents/{agentId}/probes/{id}` is claimed by this and by gadgets.probeFirst, and visibility does not settle which one the catalog publishes.",
      ],
    ]);
  });

  it("names the sub-client when a hop cannot be rooted, instead of vanishing", () => {
    // Before, an unrootable hop read as "makes no request": the operation left
    // the catalog AND the coverage gate, so nothing asked for a reason.
    expect(named("gadgets.stray")?.route).toBeNull();
    expect(
      result.coverage.unroutable.find(({ name }) => name === "gadgets.stray")
        ?.reason,
    ).toBe(
      "hop into AgentThingsClient.readThing could not be resolved: the client comes from strayThingsClient(), which is not clientFor()",
    );
  });

  it("refuses a route whose path names something the signature does not", () => {
    // The overload publishes `id`; the body binds `a`. A route keyed on `a` is
    // a call no caller could assemble.
    expect(named("gadgets.seek")?.params.map(({ name }) => name)).toEqual([
      "id",
    ]);
    expect(named("gadgets.seek")?.route).toBeNull();
    expect(
      result.coverage.unroutable.find(({ name }) => name === "gadgets.seek")
        ?.reason,
    ).toBe("the path names a, which the published signature does not declare");
  });

  it("treats a spread argument as supplying every parameter it reaches", () => {
    // `detachAll(...args)` could carry the `scope` that keys the route, so the
    // default it would otherwise fall back to is not the only possible path.
    expect(named("gadgets.detachAll")?.route).toBeNull();
    expect(
      result.coverage.unroutable.find(
        ({ name }) => name === "gadgets.detachAll",
      )?.reason,
    ).toBe("path segment depends on a value the caller may override");
  });

  it("reads a template-literal widening and a string parameter as strings", () => {
    // Both would otherwise walk the String prototype into a 50-property object.
    expect(named("gadgets.stamp")?.params).toEqual([
      { name: "id", required: true, schema: { type: "string" } },
      { name: "token", required: true, schema: { type: "string" } },
    ]);
  });

  it("keeps the adapter's copy when the SDK reaches the same route", () => {
    expect(named("things.read")).toBeUndefined();
    expect(named("getThing")?.route?.path).toBe(
      "/agents/{agentId}/things/{id}",
    );
  });

  it("still judges a dedupe-skipped SDK operation at the coverage gate", () => {
    // Dropping it from the catalog must not drop it from the gate: an
    // unannotated SDK function reaches the assistant the day either copy's
    // path literal moves, and nothing else would have failed.
    expect(
      coverageViolations(result.annotations)
        .filter(({ name }) => name === "things.read")
        .map(({ rule }) => rule),
    ).toEqual(["undocumented", "ungrouped", "unresolved-identifier"]);
  });

  it("never publishes a helper handed someone else's client", () => {
    expect(named("readThingWith")).toBeUndefined();
    expect(result.coverage.unroutable.map(({ name }) => name)).not.toContain(
      "readThingWith",
    );
  });

  it("drops a function that never reaches the wire, silently", () => {
    expect(named("thingLabel")).toBeUndefined();
    expect(result.coverage.unroutable.map(({ name }) => name)).not.toContain(
      "thingLabel",
    );
  });

  it("keeps the first source's operation when a name is republished", () => {
    const published = result.catalog.operations.filter(
      (operation) => operation.name === "listThings",
    );
    expect(published).toHaveLength(1);
    expect(published[0].route?.path).toBe("/v1/things");
  });

  it("drops transport plumbing from the parameter list", () => {
    expect(named("deleteThing")?.params.map(({ name }) => name)).toEqual([
      "id",
    ]);
    expect(named("createThing")?.params).toMatchObject([
      { name: "name", required: true },
      { name: "label", required: true },
      { name: "seed", required: false },
    ]);
  });

  it("reads the assistant JSDoc off a declaration", () => {
    expect(named("listThings")).toMatchObject({
      group: "agents",
      description: "Every thing in the workspace.",
      confirm: false,
    });
    expect(named("deleteThing")?.confirm).toBe(true);
    expect(result.coverage.ungrouped).toContain("getThing");
  });

  it("renders identical bytes for two independent extractions", () => {
    expect(renderCatalog(extractCatalog(fixtureOptions).catalog)).toBe(
      renderCatalog(extractCatalog(fixtureOptions).catalog),
    );
  });
});

describe("the live engine adapter", () => {
  const live = extractCatalog(realOptions);
  const liveRoute = (name: string) =>
    live.catalog.operations.find((operation) => operation.name === name)?.route;

  it("extracts the whole adapter surface and routes almost all of it", () => {
    expect(live.catalog.version).toBe(3);
    expect(live.catalog.operations.length).toBeGreaterThanOrEqual(100);
    expect(
      live.catalog.operations.filter((operation) => operation.route !== null)
        .length,
    ).toBeGreaterThanOrEqual(90);
  });

  it("derives the live SDK routes that only a runtime-client hop reaches", () => {
    expect(liveRoute("integrations.disconnect")).toEqual(
      route("/v1/integrations/composio/disconnect", {
        method: "POST",
        bodyFields: { toolkit: "toolkit" },
        rawResponse: true,
      }),
    );
    expect(liveRoute("preferences.setLocale")).toEqual(
      route("/v1/workspaces/{workspaceId}", {
        method: "PATCH",
        pathParams: segments("workspaceId"),
        bodyFields: { locale: "locale" },
        rawResponse: true,
      }),
    );
    expect(liveRoute("conversations.rename")).toEqual(
      route("/agents/{agentId}/conversations/{id}", {
        method: "PATCH",
        pathParams: segments("agentId", "id"),
        bodyFields: { title: "title" },
        rawResponse: true,
      }),
    );
  });

  it("never drops an operation the catalog already published", () => {
    const published = new Set(live.catalog.operations.map(({ name }) => name));
    expect(
      PUBLISHED_OPERATION_FLOOR.filter((name) => !published.has(name)),
    ).toEqual([]);
  });

  it("never drops the callability of an operation that had it", () => {
    // Staying in the catalog is not enough: an operation that loses its route,
    // or loses it to a hidden twin claiming the same one, is gone from the
    // assistant exactly as completely as a deleted one.
    const callable = new Set(
      live.catalog.operations
        .filter(isCallableOperation)
        .map(({ name }) => name),
    );
    expect(
      CALLABLE_OPERATION_FLOOR.filter((name) => !callable.has(name)),
    ).toEqual([]);
  });

  it("never changes an operation's policy or wire across the SDK flip", () => {
    // Moving a capability from its `cp/*` copy to an SDK module must carry the
    // whole `@assistant` block and the exact route with it. A twin that lands
    // in another group, drops its `confirm`, becomes visible, or answers a
    // different path leaves the catalog complete and callable — and changes
    // what the assistant is allowed to do, with nothing else to catch it.
    for (const [name, want] of Object.entries(OPERATION_POLICY_FLOOR)) {
      const operation = live.catalog.operations.find((o) => o.name === name);
      expect(operation, name).toBeDefined();
      expect(
        {
          group: operation?.group,
          confirm: operation?.confirm,
          hidden: operation?.hidden,
          route: operation?.route
            ? `${operation.route.method} ${operation.route.path}`
            : null,
          rawResponse: operation?.route?.rawResponse ?? null,
        },
        name,
      ).toEqual(want);
    }
  });

  it("advertises only what houston_call will perform", () => {
    // The index is always-on context: a name in it that the dispatcher refuses
    // has the agent promise the user an action this build cannot do.
    const module = renderCapabilityIndex(live.catalog);
    const index = JSON.parse(
      module.slice(module.indexOf('= "') + 2, module.lastIndexOf(";")),
    ) as string;
    const indexed = index
      .split("\n")
      .filter((line) => line.startsWith("- "))
      .flatMap((line) => line.slice(line.indexOf(": ") + 2).split(", "));
    expect(indexed.sort()).toEqual(
      live.catalog.operations
        .filter(isCallableOperation)
        .map(({ name }) => name)
        .sort(),
    );
  });

  it("derives the known live routes", () => {
    expect(liveRoute("listActivities")).toEqual(
      route("/agents/{agentId}/activities", {
        pathParams: segments("agentId"),
        rawResponse: true,
      }),
    );
    expect(liveRoute("removeOrgMember")).toEqual(
      route("/v1/org/members/{userId}", {
        method: "DELETE",
        pathParams: segments("userId"),
      }),
    );
    expect(liveRoute("readAgentFile")).toEqual(
      route("/agents/{agentId}/agentfile/{relPath}", {
        pathParams: [
          ...segments("agentId"),
          { name: "relPath", encoding: "path" },
        ],
        rawResponse: true,
      }),
    );
  });
});
