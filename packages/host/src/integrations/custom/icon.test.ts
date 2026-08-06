import { describe, expect, it } from "vitest";
import { faviconDomain, iconUrlOf } from "./icon";
import type { CustomIntegrationDef } from "./types";

const mcpDef = (endpoint: string): CustomIntegrationDef => ({
  kind: "mcp",
  slug: "svc",
  name: "Svc",
  endpoint,
  auth: "none",
  addedAtMs: 1,
});

const openapiDef = (
  spec: CustomIntegrationDef & { kind: "openapi" } extends { spec: infer S }
    ? S
    : never,
  baseUrl?: string,
): CustomIntegrationDef => ({
  kind: "openapi",
  slug: "svc",
  name: "Svc",
  spec,
  ...(baseUrl ? { baseUrl } : {}),
  auth: "none",
  addedAtMs: 1,
});

describe("faviconDomain", () => {
  it("keeps a plain registrable domain", () => {
    expect(faviconDomain("croma.app")).toBe("croma.app");
  });

  it("strips one technical service label", () => {
    expect(faviconDomain("mcp.linear.app")).toBe("linear.app");
    expect(faviconDomain("api.pricelabs.co")).toBe("pricelabs.co");
    expect(faviconDomain("www.example.com")).toBe("example.com");
  });

  it("never strips a brand-bearing label", () => {
    expect(faviconDomain("docs.example.com")).toBe("docs.example.com");
    expect(faviconDomain("mcp.co")).toBe("mcp.co");
  });

  it("rejects hosts that cannot carry a public favicon", () => {
    expect(faviconDomain("localhost")).toBeNull();
    expect(faviconDomain("192.168.1.5")).toBeNull();
    expect(faviconDomain("::1")).toBeNull();
  });

  it("never sends a private network name to the favicon service", () => {
    expect(faviconDomain("mcp.payroll.corp")).toBeNull();
    expect(faviconDomain("wiki.internal")).toBeNull();
    expect(faviconDomain("nas.home")).toBeNull();
    expect(faviconDomain("api.dev.local")).toBeNull();
  });
});

describe("iconUrlOf", () => {
  it("derives from the MCP endpoint host", () => {
    expect(iconUrlOf(mcpDef("https://mcp.linear.app/sse"))).toBe(
      "https://www.google.com/s2/favicons?domain=linear.app&sz=128",
    );
  });

  it("prefers the baseUrl over the spec URL for an API", () => {
    expect(
      iconUrlOf(
        openapiDef(
          { kind: "url", url: "https://raw.example.net/spec.json" },
          "https://api.pricelabs.co",
        ),
      ),
    ).toContain("domain=pricelabs.co");
  });

  it("falls back to the spec URL host", () => {
    expect(
      iconUrlOf(
        openapiDef({ kind: "url", url: "https://petstore.io/v3.json" }),
      ),
    ).toContain("domain=petstore.io");
  });

  it("reads a blob spec's first server origin", () => {
    const spec = JSON.stringify({
      servers: [{ url: "https://api.stripe.com/v1" }],
    });
    expect(iconUrlOf(openapiDef({ kind: "blob", value: spec }))).toContain(
      "domain=stripe.com",
    );
  });

  it("yields nothing for local endpoints or unparseable blobs", () => {
    expect(iconUrlOf(mcpDef("http://localhost:3000/mcp"))).toBeUndefined();
    expect(
      iconUrlOf(openapiDef({ kind: "blob", value: "not a spec" })),
    ).toBeUndefined();
  });
});
