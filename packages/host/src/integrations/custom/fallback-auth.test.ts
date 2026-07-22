import { expect, test } from "vitest";
import { FALLBACK_AUTH_SLUG, fallbackAuthTemplate } from "./fallback-auth";
import type { CustomIntegrationDef } from "./types";

/**
 * fallbackAuthTemplate derives the synthesized placement for a spec that
 * declares NO security scheme — the PriceLabs class of failure, where the
 * key's placement must come from the spec's own parameters or a safe default.
 */

function openapiDef(spec: object | string): CustomIntegrationDef {
  return {
    kind: "openapi",
    slug: "acme",
    name: "Acme",
    spec: {
      kind: "blob",
      value: typeof spec === "string" ? spec : JSON.stringify(spec),
    },
    auth: "credential",
    addedAtMs: 0,
  };
}

const doc = (extra: object) => ({
  openapi: "3.0.0",
  info: { title: "Acme", version: "1.0.0" },
  servers: [{ url: "https://api.acme.test" }],
  ...extra,
});

const TOKEN_PART = { type: "variable", name: "token" };

test("an api-key-shaped header parameter becomes a header placement (PriceLabs shape)", () => {
  const def = openapiDef(
    doc({
      paths: {
        "/listings": {
          get: {
            operationId: "getListings",
            parameters: [
              { name: "X-API-Key", in: "header", required: true },
              { name: "limit", in: "query" },
            ],
            responses: { "200": { description: "ok" } },
          },
        },
      },
    }),
  );
  expect(fallbackAuthTemplate(def)).toEqual({
    slug: FALLBACK_AUTH_SLUG,
    type: "apiKey",
    headers: { "X-API-Key": [TOKEN_PART] },
  });
});

test("path-level shared parameters and component parameters are seen", () => {
  const shared = openapiDef(
    doc({
      paths: {
        "/a": {
          parameters: [{ name: "Api-Token", in: "header" }],
          get: { operationId: "a", responses: {} },
        },
      },
    }),
  );
  expect(fallbackAuthTemplate(shared).headers).toEqual({
    "Api-Token": [TOKEN_PART],
  });

  const viaRef = openapiDef(
    doc({
      components: {
        parameters: { key: { name: "X-Auth-Token", in: "header" } },
      },
      paths: {
        "/a": {
          get: {
            operationId: "a",
            parameters: [{ $ref: "#/components/parameters/key" }],
            responses: {},
          },
        },
      },
    }),
  );
  expect(fallbackAuthTemplate(viaRef).headers).toEqual({
    "X-Auth-Token": [TOKEN_PART],
  });
});

test("an Authorization header parameter gets the Bearer prefix", () => {
  const def = openapiDef(
    doc({
      paths: {
        "/a": {
          get: {
            operationId: "a",
            parameters: [{ name: "Authorization", in: "header" }],
            responses: {},
          },
        },
      },
    }),
  );
  expect(fallbackAuthTemplate(def).headers).toEqual({
    Authorization: ["Bearer ", TOKEN_PART],
  });
});

test("a specific api-key header outranks a generic Authorization header", () => {
  const def = openapiDef(
    doc({
      paths: {
        "/a": {
          get: {
            operationId: "a",
            parameters: [
              { name: "Authorization", in: "header" },
              { name: "X-API-Key", in: "header" },
            ],
            responses: {},
          },
        },
      },
    }),
  );
  expect(fallbackAuthTemplate(def).headers).toEqual({
    "X-API-Key": [TOKEN_PART],
  });
});

test("an api-key query parameter becomes a query placement when no header hints", () => {
  const def = openapiDef(
    doc({
      paths: {
        "/a": {
          get: {
            operationId: "a",
            parameters: [{ name: "api_key", in: "query" }],
            responses: {},
          },
        },
      },
    }),
  );
  expect(fallbackAuthTemplate(def)).toEqual({
    slug: FALLBACK_AUTH_SLUG,
    type: "apiKey",
    queryParams: { api_key: [TOKEN_PART] },
  });
});

test("no hints at all falls back to Authorization: Bearer", () => {
  const def = openapiDef(doc({ paths: {} }));
  expect(fallbackAuthTemplate(def)).toEqual({
    slug: FALLBACK_AUTH_SLUG,
    type: "apiKey",
    headers: { Authorization: ["Bearer ", TOKEN_PART] },
  });
});

test("unparsable (YAML) blobs and url-sourced specs fall back to Bearer", () => {
  const yaml = openapiDef("openapi: 3.0.0\npaths: {}\n");
  expect(fallbackAuthTemplate(yaml).headers).toEqual({
    Authorization: ["Bearer ", TOKEN_PART],
  });

  const urlDef: CustomIntegrationDef = {
    kind: "openapi",
    slug: "acme",
    name: "Acme",
    spec: { kind: "url", url: "https://api.acme.test/openapi.json" },
    auth: "credential",
    addedAtMs: 0,
  };
  expect(fallbackAuthTemplate(urlDef).headers).toEqual({
    Authorization: ["Bearer ", TOKEN_PART],
  });
});

test("unrelated parameters never match (no false-positive placements)", () => {
  const def = openapiDef(
    doc({
      paths: {
        "/a": {
          get: {
            operationId: "a",
            parameters: [
              { name: "X-Request-Id", in: "header" },
              { name: "page", in: "query" },
              { name: "id", in: "path", required: true },
            ],
            responses: {},
          },
        },
      },
    }),
  );
  expect(fallbackAuthTemplate(def).headers).toEqual({
    Authorization: ["Bearer ", TOKEN_PART],
  });
});
