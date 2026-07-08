import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  CUSTOM_INTEGRATION_PROVIDER,
  customIntegrationInvalidationKeys,
} from "../src/hooks/queries/custom-integration-keys.ts";

// The custom create/update mutations invalidate BOTH the custom provider's
// connections and its toolkits (for this provider the toolkits ARE the caller's
// integrations, so the catalog changes on every create/edit). This pure helper
// pins that key set so the mutation hooks stay in sync with the query keys.

describe("customIntegrationInvalidationKeys", () => {
  it("targets the custom provider's connections and toolkits", () => {
    deepStrictEqual(customIntegrationInvalidationKeys(), [
      ["integration-connections", "custom"],
      ["integration-toolkits", "custom"],
    ]);
  });

  it("uses the custom provider id", () => {
    strictEqual(CUSTOM_INTEGRATION_PROVIDER, "custom");
  });
});
