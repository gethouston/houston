import { describe, expect, it } from "vitest";
import { extractCatalog } from "../scripts/assistant-extractor.ts";
import { renderCatalog } from "../scripts/assistant-render.ts";
import {
  fixtureOptions,
  realOptions,
  route,
  segments,
} from "./assistant-catalog-support.ts";

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
      "updateThing",
    ]);
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
