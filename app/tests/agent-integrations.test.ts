import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import {
  agentIntegrationsView,
  connectableCount,
} from "../src/components/tabs/agent-integrations/model.ts";

const read = (rel: string) =>
  readFileSync(new URL(rel, import.meta.url), "utf8");

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

describe("agentIntegrationsView", () => {
  it("no allowlist → every connection is usable (name-sorted), nothing disallowed", () => {
    const view = agentIntegrationsView({
      connections: [conn("gmail"), conn("slack")],
      catalog: CATALOG,
    });
    deepStrictEqual(
      view.activeRows.map((r) => r.connection.toolkit),
      ["gmail", "slack"],
    );
    deepStrictEqual(
      view.activeRows.map((r) => r.app.name),
      ["Gmail", "Slack"],
    );
    deepStrictEqual(view.disallowedRows, []);
  });

  it("splits connected apps outside the allowlist into disallowedRows", () => {
    const view = agentIntegrationsView({
      connections: [conn("gmail"), conn("slack")],
      catalog: CATALOG,
      allowlist: ["gmail"],
    });
    deepStrictEqual(
      view.activeRows.map((r) => r.connection.toolkit),
      ["gmail"],
    );
    deepStrictEqual(
      view.disallowedRows.map((r) => r.connection.toolkit),
      ["slack"],
    );
  });

  it("an empty allowlist disallows every connected app", () => {
    const view = agentIntegrationsView({
      connections: [conn("gmail"), conn("slack")],
      catalog: CATALOG,
      allowlist: [],
    });
    deepStrictEqual(view.activeRows, []);
    deepStrictEqual(
      view.disallowedRows.map((r) => r.connection.toolkit),
      ["gmail", "slack"],
    );
  });

  it("preserves non-active status on usable rows for the recovery UI", () => {
    const view = agentIntegrationsView({
      connections: [conn("gmail", "error"), conn("slack", "pending")],
      catalog: CATALOG,
    });
    const byToolkit = new Map(
      view.activeRows.map((r) => [r.connection.toolkit, r.connection.status]),
    );
    strictEqual(byToolkit.get("gmail"), "error");
    strictEqual(byToolkit.get("slack"), "pending");
  });

  it("disallowed rows keep non-active statuses (name-sorted)", () => {
    const view = agentIntegrationsView({
      connections: [conn("slack", "pending"), conn("notion", "error")],
      catalog: CATALOG,
      allowlist: ["gmail"],
    });
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

  it("falls back to the slug when the catalog lacks the toolkit", () => {
    const view = agentIntegrationsView({
      connections: [conn("obscure_app")],
      catalog: CATALOG,
    });
    strictEqual(view.activeRows[0]?.app.name, "obscure_app");
  });
});

/**
 * E7: the allowlist EDITOR left the Integrations tab (permissions live in one
 * place, the Permissions view), so the tab renders no editor and no settings
 * WRITE path. It does, however, read the authority gates for role-aware
 * blocked-state SIGNPOSTING: a viewer who can lift a ceiling gets an "Enable it
 * in Permissions" deep link instead of the ask-your-admin copy. The node runner
 * has no DOM, so these guard the refactor's user-visible contract on the tab
 * source (the repo's React-test idiom): the editor and its write path are gone,
 * while the read-only effective-allowlist FILTERING of the browse catalog and
 * the role-aware fix resolver stay.
 */
describe("E7 integrations tab source", () => {
  const src = read(
    "../src/components/tabs/agent-integrations/agent-integrations-tab.tsx",
  );

  it("no longer renders or imports the allowlist editor", () => {
    ok(!src.includes("AgentAllowlistSection"), "editor section removed");
    ok(!src.includes("agent-allowlist-section"), "editor import removed");
  });

  it("carries no per-agent grant plumbing", () => {
    // Permissions live in one place now — the tab reads no grant hooks and
    // never edits settings.
    ok(!src.includes("useAgentGrants"), "grant read hook dropped");
    ok(!src.includes("useSetAgentSettings"), "settings mutation hook dropped");
    // ...but the tab resolves the role-aware "Enable it in Permissions" CTA,
    // reading authority gates for signposting only, never to render an editor.
    ok(src.includes("resolvePermissionsFix"), "builds the role-aware fix");
    ok(
      src.includes("permissionsFix={permissionsFix}"),
      "hands the fix to the body",
    );
  });

  it("deep-links the blocked-app CTA into the Permissions view", () => {
    ok(src.includes("PERMISSIONS_VIEW_ID"), "targets the Permissions view");
    ok(src.includes("usePermissionsNav"), "uses the Permissions nav store");
  });

  it("hands the effective allowlist down so blocked apps render as locked rows", () => {
    ok(
      src.includes("settings?.allowedToolkits"),
      "still computes the ceiling (the agent's own allowlist, policy is per agent only)",
    );
    ok(src.includes("useAgentSettings"), "still reads agent settings");
    ok(src.includes("allowlist={allowlist}"), "hands the ceiling to the body");
    const body = read(
      "../src/components/tabs/agent-integrations/agent-integrations-body.tsx",
    );
    ok(body.includes("CatalogPane"), "the shared catalog pane stays");
    ok(
      body.includes("allowlist={allowlist}"),
      "body hands the ceiling to the pane (locks, not pre-filter)",
    );
    ok(
      body.includes("catalog={catalog}"),
      "the pane receives the FULL catalog, never a pre-filtered one",
    );
  });

  it("remounts its stateful body per agent so view filters never leak", () => {
    ok(src.includes("<AgentIntegrationsBody"), "renders the extracted body");
    ok(src.includes("key={agent.id}"), "keys the body per agent");
    const body = read(
      "../src/components/tabs/agent-integrations/agent-integrations-body.tsx",
    );
    ok(body.includes("useState"), "the category filter lives in the body");
  });
});

describe("connectableCount", () => {
  it("counts unconnected apps, minus those a Teams ceiling blocks", () => {
    strictEqual(
      connectableCount({
        catalog: CATALOG,
        connections: [conn("gmail")],
        allowlist: null,
      }),
      2,
    );
    strictEqual(
      connectableCount({
        catalog: CATALOG,
        connections: [conn("gmail")],
        allowlist: ["gmail", "slack"],
      }),
      1,
    );
    strictEqual(
      connectableCount({ catalog: CATALOG, connections: [], allowlist: [] }),
      0,
    );
  });
});
