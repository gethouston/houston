import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type {
  CustomAuthMethod,
  CustomIntegrationView,
} from "../../ui/engine-client/src/types.ts";
import {
  customAuthMethod,
  customKindBadgeKey,
  filterCustomIntegrations,
  isPendingCredential,
} from "../src/components/integrations/custom-integrations-model.ts";

const authMethod: CustomAuthMethod = {
  template: "bearer",
  label: "API key",
  fields: [{ variable: "token", label: "API key" }],
};

const active: CustomIntegrationView = {
  slug: "acme",
  name: "Acme",
  kind: "openapi",
  addedAtMs: 0,
  state: { status: "active", toolCount: 3 },
  authMethods: [authMethod],
};
const pending: CustomIntegrationView = {
  slug: "widgets",
  name: "Widgets",
  kind: "mcp",
  addedAtMs: 0,
  state: { status: "pending", authMethods: [authMethod] },
};
const errored: CustomIntegrationView = {
  slug: "broken",
  name: "Broken",
  kind: "mcp",
  addedAtMs: 0,
  state: { status: "error", message: "unreachable" },
};

describe("customKindBadgeKey", () => {
  it("maps openapi to the API badge and mcp to the MCP badge", () => {
    strictEqual(customKindBadgeKey("openapi"), "custom.badge.api");
    strictEqual(customKindBadgeKey("mcp"), "custom.badge.mcp");
  });
});

describe("customAuthMethod", () => {
  it("prefers the view's top-level authMethods", () => {
    strictEqual(customAuthMethod(active), authMethod);
  });

  it("falls back to the pending state's authMethods", () => {
    strictEqual(customAuthMethod(pending), authMethod);
  });

  it("returns null when there is no method to collect", () => {
    strictEqual(customAuthMethod(errored), null);
  });
});

describe("isPendingCredential", () => {
  it("is true only for a pending integration", () => {
    strictEqual(isPendingCredential(pending), true);
    strictEqual(isPendingCredential(active), false);
    strictEqual(isPendingCredential(errored), false);
  });
});

describe("filterCustomIntegrations", () => {
  const all = [active, pending, errored];
  const slugs = (items: CustomIntegrationView[]) => items.map((i) => i.slug);

  it("keeps everything on a blank or whitespace query", () => {
    deepStrictEqual(filterCustomIntegrations(all, ""), all);
    deepStrictEqual(filterCustomIntegrations(all, "   "), all);
  });

  it("matches name and slug case-insensitively", () => {
    deepStrictEqual(slugs(filterCustomIntegrations(all, "ACME")), ["acme"]);
    deepStrictEqual(slugs(filterCustomIntegrations(all, "widg")), ["widgets"]);
  });

  it("returns empty when nothing matches", () => {
    deepStrictEqual(filterCustomIntegrations(all, "zzz"), []);
  });
});
