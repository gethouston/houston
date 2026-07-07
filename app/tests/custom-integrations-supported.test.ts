import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { IntegrationConnection } from "@houston-ai/engine-client";
import {
  customIntegrationsSupported,
  customSlugSet,
} from "../src/components/integrations/capabilities.ts";

describe("customIntegrationsSupported", () => {
  it("true only when the host advertises the custom provider", () => {
    strictEqual(
      customIntegrationsSupported({ integrations: ["composio", "custom"] }),
      true,
    );
  });

  it("false when only composio is wired (self-host direct, no gateway)", () => {
    strictEqual(
      customIntegrationsSupported({ integrations: ["composio"] }),
      false,
    );
  });

  it("false when no provider is wired, and while capabilities are unresolved", () => {
    strictEqual(customIntegrationsSupported({ integrations: [] }), false);
    strictEqual(customIntegrationsSupported(null), false);
  });
});

describe("customSlugSet", () => {
  const conn = (connectionId: string): IntegrationConnection => ({
    toolkit: connectionId, // slug == toolkit == connectionId for custom
    connectionId,
    status: "active",
  });

  it("keys by connectionId (== slug) so either lookup routes custom", () => {
    const set = customSlugSet([conn("acme_crm"), conn("weatherly")]);
    strictEqual(set.has("acme_crm"), true);
    strictEqual(set.has("weatherly"), true);
    strictEqual(set.has("gmail"), false);
  });

  it("is empty for no custom connections", () => {
    deepStrictEqual([...customSlugSet([])], []);
  });
});
