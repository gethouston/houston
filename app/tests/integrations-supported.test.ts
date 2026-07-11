import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  activeIntegration,
  integrationsSupported,
} from "../src/components/integrations/model.ts";

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

describe("activeIntegration", () => {
  const composio = { provider: "composio", ready: true };
  const hub = { provider: "composio-apps", ready: true };
  it("prefers the platform provider when wired", () => {
    deepStrictEqual(activeIntegration([hub, composio]), composio);
  });
  it("falls back to the first hub so hub-only locals render the same UI", () => {
    deepStrictEqual(activeIntegration([hub]), hub);
  });
  it("undefined when integrations are off entirely", () => {
    strictEqual(activeIntegration([]), undefined);
    strictEqual(activeIntegration(undefined), undefined);
  });
});
