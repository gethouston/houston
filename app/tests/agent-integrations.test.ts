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
  it("degraded when grants are null (unsupported host)", () => {
    const view = agentIntegrationsView({
      connections: [conn("gmail"), conn("slack")],
      catalog: CATALOG,
      grants: null,
    });
    strictEqual(view.mode, "degraded");
    if (view.mode !== "degraded") throw new Error("unreachable");
    // Every connected app is usable by this agent; rows are name-sorted.
    deepStrictEqual(
      view.rows.map((r) => r.connection.toolkit),
      ["gmail", "slack"],
    );
    deepStrictEqual(
      view.rows.map((r) => r.app.name),
      ["Gmail", "Slack"],
    );
  });

  it("grants mode lists only the granted connections", () => {
    const view = agentIntegrationsView({
      connections: [conn("gmail"), conn("slack"), conn("notion")],
      catalog: CATALOG,
      grants: ["slack", "gmail"],
    });
    strictEqual(view.mode, "grants");
    if (view.mode !== "grants") throw new Error("unreachable");
    // notion is connected but not granted → excluded from the active list.
    deepStrictEqual(
      view.activeRows.map((r) => r.connection.toolkit),
      ["gmail", "slack"],
    );
  });

  it("an ungranted active connection appears in no grants-view row", () => {
    const view = agentIntegrationsView({
      connections: [conn("gmail"), conn("slack"), conn("notion")],
      catalog: CATALOG,
      grants: ["gmail"],
    });
    if (view.mode !== "grants") throw new Error("unreachable");
    // Section 1 has only the granted app. Connected-but-ungranted apps are a
    // Settings > Connected accounts concern now — absent from active AND
    // disallowed (there is no allowlist here, so nothing is disallowed).
    deepStrictEqual(
      view.activeRows.map((r) => r.connection.toolkit),
      ["gmail"],
    );
    deepStrictEqual(view.disallowedRows, []);
    const shown = [...view.activeRows, ...view.disallowedRows].map(
      (r) => r.connection.toolkit,
    );
    ok(!shown.includes("slack"), "ungranted active slack is not shown");
    ok(!shown.includes("notion"), "ungranted active notion is not shown");
  });

  it("ungranted pending/errored connections appear in no grants-view row", () => {
    const view = agentIntegrationsView({
      connections: [conn("slack", "pending"), conn("notion", "error")],
      catalog: CATALOG,
      grants: [],
    });
    if (view.mode !== "grants") throw new Error("unreachable");
    deepStrictEqual(view.activeRows, []);
    deepStrictEqual(view.disallowedRows, []);
  });

  it("grants mode with an empty grant set yields no active rows", () => {
    const view = agentIntegrationsView({
      connections: [conn("gmail")],
      catalog: CATALOG,
      grants: [],
    });
    strictEqual(view.mode, "grants");
    if (view.mode !== "grants") throw new Error("unreachable");
    deepStrictEqual(view.activeRows, []);
  });

  it("a granted slug with no matching connection is ignored", () => {
    const view = agentIntegrationsView({
      connections: [conn("gmail")],
      catalog: CATALOG,
      grants: ["gmail", "slack"],
    });
    if (view.mode !== "grants") throw new Error("unreachable");
    deepStrictEqual(
      view.activeRows.map((r) => r.connection.toolkit),
      ["gmail"],
    );
  });

  it("preserves non-active status on granted rows for the recovery UI", () => {
    const view = agentIntegrationsView({
      connections: [conn("gmail", "error"), conn("slack", "pending")],
      catalog: CATALOG,
      grants: ["gmail", "slack"],
    });
    if (view.mode !== "grants") throw new Error("unreachable");
    const byToolkit = new Map(
      view.activeRows.map((r) => [r.connection.toolkit, r.connection.status]),
    );
    strictEqual(byToolkit.get("gmail"), "error");
    strictEqual(byToolkit.get("slack"), "pending");
  });

  it("falls back to the slug when the catalog lacks the toolkit", () => {
    const view = agentIntegrationsView({
      connections: [conn("obscure_app")],
      catalog: CATALOG,
      grants: null,
    });
    if (view.mode !== "degraded") throw new Error("unreachable");
    strictEqual(view.rows[0]?.app.name, "obscure_app");
  });
});

/**
 * E7 (task B): the allowlist EDITOR left the Integrations tab for Agent
 * Settings > Access, so the tab now renders identically for members and
 * managers. The node runner has no DOM, so these guard the refactor's
 * user-visible contract on the tab source (the repo's React-test idiom):
 * the editor and its write path are gone, while the read-only effective-
 * allowlist FILTERING of the browse catalog stays.
 */
describe("E7 integrations tab source", () => {
  const src = read(
    "../src/components/tabs/agent-integrations/agent-integrations-tab.tsx",
  );

  it("no longer renders or imports the allowlist editor", () => {
    ok(!src.includes("AgentAllowlistSection"), "editor section removed");
    ok(!src.includes("agent-allowlist-section"), "editor import removed");
  });

  it("drops the manager-only settings write path", () => {
    ok(!src.includes("useSetAgentSettings"), "settings mutation hook dropped");
    ok(!src.includes("isAgentManager"), "manager gate no longer needed");
  });

  it("hands the effective allowlist down so blocked apps render as locked rows", () => {
    // The tab still computes the ceiling and hands it to the body, which now
    // passes it to the shared catalog pane — blocked apps render as LOCKED rows
    // there (via browseCatalogView + CatalogLockedSection) instead of being
    // filtered out and vanishing silently.
    ok(src.includes("effectiveAllowlist"), "still computes the ceiling");
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
    // The tab components stay mounted across agent switches (experience-
    // renderer keys by tab, not agent), so the category filter lives in a body
    // remounted via key={agent.id} — otherwise one agent's filter would hide
    // the next agent's apps behind category-aware empty copy.
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
