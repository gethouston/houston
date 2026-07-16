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

describe("agentIntegrationsView (allowlist overlay)", () => {
  it("no allowlist → nothing disallowed", () => {
    const view = agentIntegrationsView({
      connections: [conn("gmail"), conn("slack")],
      catalog: CATALOG,
    });
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
      allowlist: ["gmail"],
    });
    // slack is connected but the ceiling forbids it → not usable, shown as disallowed.
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
});
