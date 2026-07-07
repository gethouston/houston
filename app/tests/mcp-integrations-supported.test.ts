import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { IntegrationConnection } from "@houston-ai/engine-client";
import {
  mcpIntegrationsSupported,
  mcpSlugSet,
} from "../src/components/integrations/capabilities.ts";

describe("mcpIntegrationsSupported", () => {
  it("true only when the host advertises the mcp provider", () => {
    strictEqual(
      mcpIntegrationsSupported({ integrations: ["composio", "mcp"] }),
      true,
    );
  });

  it("false when only composio + custom are wired (no mcp)", () => {
    strictEqual(
      mcpIntegrationsSupported({ integrations: ["composio", "custom"] }),
      false,
    );
  });

  it("false when no provider is wired, and while capabilities are unresolved", () => {
    strictEqual(mcpIntegrationsSupported({ integrations: [] }), false);
    strictEqual(mcpIntegrationsSupported(null), false);
  });
});

describe("mcpSlugSet", () => {
  const conn = (connectionId: string): IntegrationConnection => ({
    toolkit: connectionId, // slug == toolkit == connectionId for mcp
    connectionId,
    status: "active",
  });

  it("keys by connectionId (== slug) so either lookup routes mcp", () => {
    const set = mcpSlugSet([conn("acme_tracker"), conn("weatherly")]);
    strictEqual(set.has("acme_tracker"), true);
    strictEqual(set.has("weatherly"), true);
    strictEqual(set.has("gmail"), false);
  });

  it("is empty for no mcp connections", () => {
    deepStrictEqual([...mcpSlugSet([])], []);
  });
});
