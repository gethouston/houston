import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import { agentIntegrationsView } from "../src/components/tabs/agent-integrations/model.ts";

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
  connectionId = `ca_${toolkit}`,
  accountLabel?: string,
): IntegrationConnection => ({
  toolkit,
  connectionId,
  status,
  ...(accountLabel ? { accountLabel } : {}),
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
      grants: ["ca_slack", "ca_gmail"],
    });
    strictEqual(view.mode, "grants");
    if (view.mode !== "grants") throw new Error("unreachable");
    // notion is connected but not granted → excluded from the active list.
    deepStrictEqual(
      view.activeRows.map((r) => r.connection.toolkit),
      ["gmail", "slack"],
    );
    // grantedToolkits is the app-level view of the granted ACCOUNTS.
    strictEqual(view.grantedToolkits.has("notion"), false);
    strictEqual(view.grantedToolkits.has("slack"), true);
    strictEqual(view.grantedToolkits.has("gmail"), true);
  });

  it("grants mode exposes connected-but-not-granted active apps as accountRows", () => {
    const view = agentIntegrationsView({
      connections: [conn("gmail"), conn("slack"), conn("notion")],
      catalog: CATALOG,
      grants: ["ca_gmail"],
    });
    if (view.mode !== "grants") throw new Error("unreachable");
    // Section 1 has the granted app; Section 2 has the rest, name-sorted.
    deepStrictEqual(
      view.activeRows.map((r) => r.connection.toolkit),
      ["gmail"],
    );
    deepStrictEqual(
      view.accountRows.map((r) => r.connection.toolkit),
      ["notion", "slack"],
    );
  });

  it("accountRows excludes pending/errored non-granted connections", () => {
    const view = agentIntegrationsView({
      connections: [conn("slack", "pending"), conn("notion", "error")],
      catalog: CATALOG,
      grants: [],
    });
    if (view.mode !== "grants") throw new Error("unreachable");
    // Only ACTIVE connections are activatable for this agent.
    deepStrictEqual(view.accountRows, []);
  });

  it("a granted app is never also an accountRow", () => {
    const view = agentIntegrationsView({
      connections: [conn("gmail"), conn("slack")],
      catalog: CATALOG,
      grants: ["ca_gmail", "ca_slack"],
    });
    if (view.mode !== "grants") throw new Error("unreachable");
    deepStrictEqual(view.accountRows, []);
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

  it("a granted id with no matching connection is ignored", () => {
    const view = agentIntegrationsView({
      connections: [conn("gmail")],
      catalog: CATALOG,
      grants: ["ca_gmail", "ca_slack"],
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
      grants: ["ca_gmail", "ca_slack"],
    });
    if (view.mode !== "grants") throw new Error("unreachable");
    const byToolkit = new Map(
      view.activeRows.map((r) => [r.connection.toolkit, r.connection.status]),
    );
    strictEqual(byToolkit.get("gmail"), "error");
    strictEqual(byToolkit.get("slack"), "pending");
  });

  it("labels every account of a toolkit that has more than one in the list", () => {
    const view = agentIntegrationsView({
      connections: [
        conn("gmail", "active", "ca_work", "work@acme.com"),
        conn("gmail", "active", "ca_home", "me@home.com"),
        conn("slack", "active", "ca_slack"),
      ],
      catalog: CATALOG,
      grants: ["ca_work", "ca_home", "ca_slack"],
    });
    if (view.mode !== "grants") throw new Error("unreachable");
    const byId = new Map(
      view.activeRows.map((r) => [
        r.connection.connectionId,
        r.showAccountLabel,
      ]),
    );
    // Both gmail accounts share a toolkit → labelled so they stay apart.
    strictEqual(byId.get("ca_work"), true);
    strictEqual(byId.get("ca_home"), true);
    // The lone slack account needs no per-account label.
    strictEqual(byId.get("ca_slack"), false);
  });

  it("flags multi-account labelling per list, not across lists", () => {
    // One gmail granted, another gmail still an accountRow: each list has a
    // single gmail, so neither is labelled (the flag is scoped to its list).
    const view = agentIntegrationsView({
      connections: [
        conn("gmail", "active", "ca_work", "work@acme.com"),
        conn("gmail", "active", "ca_home", "me@home.com"),
      ],
      catalog: CATALOG,
      grants: ["ca_work"],
    });
    if (view.mode !== "grants") throw new Error("unreachable");
    strictEqual(view.activeRows[0]?.showAccountLabel, false);
    strictEqual(view.accountRows[0]?.showAccountLabel, false);
  });

  it("labels multi-account toolkits in degraded mode too", () => {
    const view = agentIntegrationsView({
      connections: [
        conn("gmail", "active", "ca_a", "a@x.com"),
        conn("gmail", "active", "ca_b", "b@x.com"),
      ],
      catalog: CATALOG,
      grants: null,
    });
    if (view.mode !== "degraded") throw new Error("unreachable");
    ok(view.rows.every((r) => r.showAccountLabel));
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

  it("keeps the effective-allowlist filtering of the browse catalog", () => {
    ok(src.includes("effectiveAllowlist"), "still computes the ceiling");
    ok(src.includes("useAgentSettings"), "still reads agent settings");
    ok(src.includes("browseCatalog"), "still narrows the browse catalog");
    ok(src.includes("ConnectMoreAppsSection"), "browse section stays");
  });
});
