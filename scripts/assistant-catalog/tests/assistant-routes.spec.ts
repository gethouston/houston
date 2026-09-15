import { describe, expect, it } from "vitest";
import { extractCatalog } from "../assistant-extractor.ts";
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
      auditThings: route("/v1/things/audit", {
        query: { before: "before", limit: "limit" },
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

  it("carries an optional query key the caller may omit", () => {
    // The dispatcher drops a key whose parameter the caller left out, which is
    // the same thing the source's `if` does - so optionality needs no marker.
    expect(routes.get("auditThings")?.query).toEqual({
      before: "before",
      limit: "limit",
    });
  });

  it("drops an optional key no caller of the operation can fill", () => {
    // `listNotes` offers a window; the module method never passes one, so the
    // request can never carry it and a key here would be uncallable noise.
    expect(routes.get("things.notes")).toEqual(
      route("/agents/{agentId}/things/{id}/notes", {
        pathParams: segments("agentId", "id"),
        rawResponse: true,
      }),
    );
  });

  it("never publishes the mixin factory itself", () => {
    expect(routes.has("ThingsMixin")).toBe(false);
  });

  it("refuses to guess a route for every irregular shape", () => {
    const expected = {
      allThings: "non-literal path",
      branchedThing: "multiple request calls",
      "gadgets.detachAll":
        "path segment depends on a value the caller may override",
      "gadgets.seek":
        "the path names a, which the published signature does not declare",
      "gadgets.stray":
        "hop into AgentThingsClient.readThing could not be resolved: the client comes from strayThingsClient(), which is not clientFor()",
      getThingContext: "unescaped path interpolation",
      pollThings: "query string is assembled from values no route can name",
      sweepThings: "query string is assembled from values no route can name",
      headThing: "unsupported HTTP method HEAD",
      probeThing: "non-assignment request option",
      replaceThing: "multiple request calls",
      tagThing: "body value is not a parameter",
      "things.audit": "the client method issues several requests",
      "things.pin": "body value is not a parameter",
      "things.readLoose":
        "hop into AgentThingsClient.readThing could not be resolved: the agent the client is rooted at is not a parameter",
      "things.unpin": "path segment depends on a value the caller may override",
      "things.writes.detach":
        "path segment depends on a value the caller may override",
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
