import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import { agentIntegrationsView } from "../src/components/tabs/agent-integrations/model.ts";

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
    strictEqual(view.grantedToolkits.has("notion"), false);
    strictEqual(view.grantedToolkits.has("slack"), true);
  });

  it("grants mode exposes connected-but-not-granted active apps as accountRows", () => {
    const view = agentIntegrationsView({
      connections: [conn("gmail"), conn("slack"), conn("notion")],
      catalog: CATALOG,
      grants: ["gmail"],
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
      grants: ["gmail", "slack"],
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
