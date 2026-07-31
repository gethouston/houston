import { expect, test } from "vitest";
import { sameServiceOrigins } from "./service-origins";
import type { CustomIntegrationDef } from "./types";

const blobDef = (
  servers: string[],
  extra: Partial<CustomIntegrationDef> = {},
): CustomIntegrationDef => ({
  kind: "openapi",
  slug: "svc",
  name: "Svc",
  auth: "credential",
  addedAtMs: 0,
  spec: {
    kind: "blob",
    value: JSON.stringify({
      openapi: "3.0.0",
      info: { title: "S", version: "1" },
      servers: servers.map((url) => ({ url })),
      paths: {},
    }),
  },
  ...(extra as object),
});

const mcpDef = (endpoint: string): CustomIntegrationDef => ({
  kind: "mcp",
  slug: "svc",
  name: "Svc",
  auth: "credential",
  addedAtMs: 0,
  endpoint,
});

test("same blob servers (even with different paths) keep the origin match", () => {
  expect(
    sameServiceOrigins(
      blobDef(["https://api.acme.com/v1"]),
      blobDef(["https://api.acme.com/v2"]),
    ),
  ).toBe(true);
});

test("a moved server origin is a change — the attacker-redirect case", () => {
  expect(
    sameServiceOrigins(
      blobDef(["https://api.acme.com/v1"]),
      blobDef(["https://evil.example/v1"]),
    ),
  ).toBe(false);
  // ADDING an origin next to the legit one is just as much of a change.
  expect(
    sameServiceOrigins(
      blobDef(["https://api.acme.com/v1"]),
      blobDef(["https://api.acme.com/v1", "https://evil.example/v1"]),
    ),
  ).toBe(false);
});

test("indeterminate specs never match: relative servers, no servers, garbage", () => {
  const good = blobDef(["https://api.acme.com/v1"]);
  expect(sameServiceOrigins(good, blobDef(["/v1"]))).toBe(false);
  expect(sameServiceOrigins(good, blobDef([]))).toBe(false);
  const garbage = {
    ...good,
    spec: { kind: "blob", value: "not a spec" },
  } as CustomIntegrationDef;
  expect(sameServiceOrigins(good, garbage)).toBe(false);
});

test("YAML blobs parse for the comparison", () => {
  const yaml = {
    ...blobDef([]),
    spec: {
      kind: "blob",
      value: "openapi: 3.0.0\nservers:\n  - url: https://api.acme.com/v1\n",
    },
  } as CustomIntegrationDef;
  expect(sameServiceOrigins(blobDef(["https://api.acme.com/v1"]), yaml)).toBe(
    true,
  );
});

test("baseUrl override wins over the spec's servers", () => {
  const overridden = blobDef(["https://api.acme.com/v1"], {
    baseUrl: "https://evil.example",
  });
  expect(
    sameServiceOrigins(blobDef(["https://api.acme.com/v1"]), overridden),
  ).toBe(false);
});

test("url-kind specs match only on the identical document URL", () => {
  const urlDef = (url: string): CustomIntegrationDef => ({
    kind: "openapi",
    slug: "svc",
    name: "Svc",
    auth: "credential",
    addedAtMs: 0,
    spec: { kind: "url", url },
  });
  const a = urlDef("https://api.acme.com/openapi.json");
  expect(
    sameServiceOrigins(a, urlDef("https://api.acme.com/openapi.json")),
  ).toBe(true);
  expect(
    sameServiceOrigins(a, urlDef("https://evil.example/openapi.json")),
  ).toBe(false);
  // Source-kind changes are indeterminate — never carry.
  expect(sameServiceOrigins(a, blobDef(["https://api.acme.com/v1"]))).toBe(
    false,
  );
});

test("MCP endpoints compare by origin; kind changes never match", () => {
  expect(
    sameServiceOrigins(
      mcpDef("https://mcp.acme.com/mcp"),
      mcpDef("https://mcp.acme.com/other"),
    ),
  ).toBe(true);
  expect(
    sameServiceOrigins(
      mcpDef("https://mcp.acme.com/mcp"),
      mcpDef("https://evil.example/mcp"),
    ),
  ).toBe(false);
  expect(
    sameServiceOrigins(
      mcpDef("https://mcp.acme.com/mcp"),
      blobDef(["https://mcp.acme.com"]),
    ),
  ).toBe(false);
});
