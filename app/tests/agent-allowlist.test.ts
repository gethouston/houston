import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import {
  agentIntegrationsView,
  effectiveAllowlist,
} from "../src/components/tabs/agent-integrations/model.ts";

const tk = (slug: string, name: string): IntegrationToolkit => ({
  slug,
  name,
  categories: [],
  description: `${name} desc`,
});

const conn = (
  toolkit: string,
  status: IntegrationConnection["status"] = "active",
): IntegrationConnection => ({
  toolkit,
  connectionId: `ca_${toolkit}`,
  status,
});

const CATALOG: IntegrationToolkit[] = [
  tk("slack", "Slack"),
  tk("gmail", "Gmail"),
  tk("notion", "Notion"),
];

describe("effectiveAllowlist", () => {
  it("both ceilings null → unrestricted (null)", () => {
    strictEqual(
      effectiveAllowlist({ allowedToolkits: null, orgAllowedToolkits: null }),
      null,
    );
  });

  it("agent null → the org ceiling", () => {
    deepStrictEqual(
      effectiveAllowlist({
        allowedToolkits: null,
        orgAllowedToolkits: ["gmail", "slack"],
      }),
      ["gmail", "slack"],
    );
  });

  it("org null → the agent ceiling", () => {
    deepStrictEqual(
      effectiveAllowlist({
        allowedToolkits: ["gmail"],
        orgAllowedToolkits: null,
      }),
      ["gmail"],
    );
  });

  it("both set → intersection in agent order", () => {
    deepStrictEqual(
      effectiveAllowlist({
        allowedToolkits: ["gmail", "slack", "notion"],
        orgAllowedToolkits: ["notion", "gmail", "asana"],
      }),
      ["gmail", "notion"],
    );
  });

  it("disjoint ceilings → empty (nothing allowed)", () => {
    deepStrictEqual(
      effectiveAllowlist({
        allowedToolkits: ["gmail"],
        orgAllowedToolkits: ["slack"],
      }),
      [],
    );
  });

  it("empty agent ceiling → empty regardless of org", () => {
    deepStrictEqual(
      effectiveAllowlist({ allowedToolkits: [], orgAllowedToolkits: null }),
      [],
    );
  });
});

describe("agentIntegrationsView (allowlist overlay)", () => {
  it("no allowlist → nothing disallowed (behaves as before)", () => {
    const view = agentIntegrationsView({
      connections: [conn("gmail"), conn("slack")],
      catalog: CATALOG,
      grants: ["gmail", "slack"],
    });
    if (view.mode !== "grants") throw new Error("unreachable");
    deepStrictEqual(view.disallowedRows, []);
    deepStrictEqual(
      view.activeRows.map((r) => r.connection.toolkit),
      ["gmail", "slack"],
    );
  });

  it("splits connected apps outside the allowlist into disallowedRows", () => {
    const view = agentIntegrationsView({
      connections: [conn("gmail"), conn("slack")],
      catalog: CATALOG,
      grants: ["gmail", "slack"],
      allowlist: ["gmail"],
    });
    if (view.mode !== "grants") throw new Error("unreachable");
    // slack is granted but the ceiling forbids it → not usable, shown as disallowed.
    deepStrictEqual(
      view.activeRows.map((r) => r.connection.toolkit),
      ["gmail"],
    );
    deepStrictEqual(
      view.disallowedRows.map((r) => r.connection.toolkit),
      ["slack"],
    );
  });

  it("a disallowed, ungranted app is not offered as an accountRow", () => {
    const view = agentIntegrationsView({
      connections: [conn("gmail"), conn("notion")],
      catalog: CATALOG,
      grants: ["gmail"],
      allowlist: ["gmail"],
    });
    if (view.mode !== "grants") throw new Error("unreachable");
    // notion is connected + active + ungranted, but disallowed → not activatable.
    deepStrictEqual(view.accountRows, []);
    deepStrictEqual(
      view.disallowedRows.map((r) => r.connection.toolkit),
      ["notion"],
    );
  });

  it("an empty allowlist disallows every connected app", () => {
    const view = agentIntegrationsView({
      connections: [conn("gmail"), conn("slack")],
      catalog: CATALOG,
      grants: ["gmail", "slack"],
      allowlist: [],
    });
    if (view.mode !== "grants") throw new Error("unreachable");
    deepStrictEqual(view.activeRows, []);
    deepStrictEqual(view.accountRows, []);
    deepStrictEqual(
      view.disallowedRows.map((r) => r.connection.toolkit),
      ["gmail", "slack"],
    );
  });

  it("disallowed rows keep non-active statuses (name-sorted)", () => {
    const view = agentIntegrationsView({
      connections: [conn("slack", "pending"), conn("notion", "error")],
      catalog: CATALOG,
      grants: [],
      allowlist: ["gmail"],
    });
    if (view.mode !== "grants") throw new Error("unreachable");
    deepStrictEqual(
      view.disallowedRows.map((r) => r.connection.toolkit),
      ["notion", "slack"],
    );
    const byToolkit = new Map(
      view.disallowedRows.map((r) => [
        r.connection.toolkit,
        r.connection.status,
      ]),
    );
    strictEqual(byToolkit.get("slack"), "pending");
    strictEqual(byToolkit.get("notion"), "error");
  });

  it("degraded mode ignores the allowlist entirely", () => {
    const view = agentIntegrationsView({
      connections: [conn("gmail"), conn("slack")],
      catalog: CATALOG,
      grants: null,
      allowlist: ["gmail"],
    });
    strictEqual(view.mode, "degraded");
  });
});
