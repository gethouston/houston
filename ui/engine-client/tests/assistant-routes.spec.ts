import { describe, expect, it } from "vitest";
import { extractCatalog } from "../scripts/assistant-extractor.ts";
import {
  fixtureOptions,
  route,
  segments,
} from "./assistant-catalog-support.ts";

const result = extractCatalog(fixtureOptions);
const routes = new Map(
  result.catalog.operations.map((operation) => [
    operation.name,
    operation.route,
  ]),
);

describe("assistant route derivation", () => {
  it.each(
    Object.entries({
      listThings: route("/v1/things", { rawResponse: true }),
      listAgentThings: route("/agents/{agentId}/things", {
        pathParams: segments("agentId"),
        rawResponse: true,
      }),
      getThing: route("/agents/{agentId}/things/{id}", {
        pathParams: segments("agentId", "id"),
        rawResponse: true,
      }),
      readThingFile: route("/agents/{agentId}/thingfile/{relPath}", {
        pathParams: [
          ...segments("agentId"),
          { name: "relPath", encoding: "path" },
        ],
        rawResponse: true,
      }),
      integrationThings: route("/v1/integrations/{provider}/things", {
        pathParams: segments("provider"),
        rawResponse: true,
      }),
      thingUsage: route("/v1/things/usage", {
        query: { days: "days" },
        rawResponse: true,
      }),
      updateThing: route("/v1/things/{id}", {
        method: "PATCH",
        pathParams: segments("id"),
        body: "patch",
      }),
      createThing: route("/v1/things", {
        method: "POST",
        bodyFields: { name: "name", alias: "label", claudeMd: "seed.claudeMd" },
      }),
      pushCredential: route("/agents/{agentId}/credential", {
        method: "PUT",
        pathParams: segments("agentId"),
        body: "payload",
      }),
      deleteThing: route("/v1/things/{id}", {
        method: "DELETE",
        pathParams: segments("id"),
      }),
      listShadowThings: route("/v1/shadow-things"),
    }),
  )("routes %s", (name, expected) => {
    expect(routes.get(name)).toEqual(expected);
  });

  it.each(
    Object.entries({
      listAgentFiles: route("/agents/{agentId}/files", {
        pathParams: segments("agentId"),
        rawResponse: true,
      }),
      readAgentFileEntry: route("/agents/{agentId}/files/read", {
        pathParams: segments("agentId"),
        query: { path: "relPath" },
        rawResponse: true,
      }),
      deleteAgentFileEntry: route("/agents/{agentId}/files", {
        method: "DELETE",
        pathParams: segments("agentId"),
        query: { path: "relPath" },
      }),
    }),
  )("expands the mixin's transport wrapper for %s", (name, expected) => {
    expect(routes.get(name)).toEqual(expected);
  });

  it("never publishes the mixin factory itself", () => {
    expect(routes.has("ThingsMixin")).toBe(false);
  });

  it("refuses to guess a route for every irregular shape", () => {
    const expected = {
      allThings: "non-literal path",
      branchedThing: "multiple request calls",
      getThingContext: "unescaped path interpolation",
      headThing: "unsupported HTTP method HEAD",
      probeThing: "non-assignment request option",
      replaceThing: "multiple request calls",
      tagThing: "body value is not a parameter",
    };
    for (const name of Object.keys(expected))
      expect(routes.get(name), `${name} must stay unroutable`).toBeNull();
    expect(
      Object.fromEntries(
        result.coverage.unroutable.map(({ name, reason }) => [name, reason]),
      ),
    ).toEqual(expected);
  });
});
