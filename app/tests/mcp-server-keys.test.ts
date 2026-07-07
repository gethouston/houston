import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  MCP_INTEGRATION_PROVIDER,
  mcpServerInvalidationKeys,
} from "../src/hooks/queries/mcp-server-keys.ts";

// The mcp create/update mutations invalidate BOTH the mcp provider's
// connections and its toolkits (for this provider the toolkits ARE the caller's
// servers, so the catalog changes on every create/edit). This pure helper pins
// that key set so the mutation hooks stay in sync with the query keys.

describe("mcpServerInvalidationKeys", () => {
  it("targets the mcp provider's connections and toolkits", () => {
    deepStrictEqual(mcpServerInvalidationKeys(), [
      ["integration-connections", "mcp"],
      ["integration-toolkits", "mcp"],
    ]);
  });

  it("uses the mcp provider id", () => {
    strictEqual(MCP_INTEGRATION_PROVIDER, "mcp");
  });
});
