import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { integrationsSupported } from "../src/components/integrations/model.ts";

describe("integrationsSupported", () => {
  it("true when the host advertises a wired provider", () => {
    strictEqual(integrationsSupported({ integrations: ["composio"] }), true);
  });

  it("false when the deployment wired no provider (host 503s the routes)", () => {
    strictEqual(integrationsSupported({ integrations: [] }), false);
  });

  it("false while capabilities are unresolved (loading, or legacy engine)", () => {
    strictEqual(integrationsSupported(null), false);
  });
});
