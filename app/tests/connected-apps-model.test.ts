import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { IntegrationConnection } from "@houston-ai/engine-client";
import {
  catalogHiddenToolkits,
  groupAccounts,
  partitionConnections,
} from "../src/components/integrations/connected-apps-model.ts";

const conn = (
  toolkit: string,
  status: IntegrationConnection["status"] = "active",
  id = `c-${toolkit}`,
): IntegrationConnection => ({ toolkit, connectionId: id, status });

describe("partitionConnections", () => {
  it("keeps working connections installed and leaves broken ones to the catalog", () => {
    const { installed, broken } = partitionConnections([
      conn("gmail", "active"),
      conn("slack", "pending"),
      conn("notion", "error"),
      conn("linear", "active"),
    ]);
    deepStrictEqual(
      installed.map((c) => c.toolkit),
      ["gmail", "linear"],
    );
    deepStrictEqual(
      [...broken].map(([toolkit, b]) => [toolkit, b.status]),
      [
        ["slack", "pending"],
        ["notion", "error"],
      ],
    );
  });

  it("gives an app ONE home: a working login beats its leftover pending one", () => {
    const { installed, broken } = partitionConnections([
      conn("slack", "pending", "c-old"),
      conn("slack", "active", "c-new"),
    ]);
    strictEqual(installed.length, 1);
    strictEqual(installed[0]?.connectionId, "c-new");
    strictEqual(broken.has("slack"), false);
  });

  it("shows one status per app when several attempts are broken", () => {
    const { broken } = partitionConnections([
      conn("slack", "error", "c-1"),
      conn("slack", "pending", "c-2"),
    ]);
    strictEqual(broken.size, 1);
    strictEqual(broken.get("slack")?.status, "error");
    strictEqual(broken.get("slack")?.connection.connectionId, "c-1");
  });

  it("handles an empty list", () => {
    const { installed, broken } = partitionConnections([]);
    deepStrictEqual(installed, []);
    strictEqual(broken.size, 0);
  });
});

describe("catalogHiddenToolkits", () => {
  it("hides working connections only", () => {
    const hidden = catalogHiddenToolkits([
      conn("gmail", "active"),
      conn("slack", "pending"),
      conn("notion", "error"),
    ]);
    deepStrictEqual([...hidden], ["gmail"]);
  });

  it("hides nothing when no connection ever landed", () => {
    const hidden = catalogHiddenToolkits([
      conn("slack", "pending"),
      conn("jira", "error"),
    ]);
    strictEqual(hidden.size, 0);
  });
});

describe("groupAccounts", () => {
  it("folds several accounts of one toolkit into one app, primary first", () => {
    const grouped = groupAccounts([
      conn("gmail", "active", "ca_1"),
      conn("slack", "active", "ca_2"),
      conn("gmail", "active", "ca_3"),
    ]);
    deepStrictEqual(
      grouped.map((g) => ({
        toolkit: g.connection.toolkit,
        primary: g.connection.connectionId,
        accounts: g.accounts.map((a) => a.connectionId),
      })),
      [
        { toolkit: "gmail", primary: "ca_1", accounts: ["ca_1", "ca_3"] },
        { toolkit: "slack", primary: "ca_2", accounts: ["ca_2"] },
      ],
    );
  });

  it("preserves first-seen order and handles an empty list", () => {
    deepStrictEqual(groupAccounts([]), []);
    const grouped = groupAccounts([
      conn("notion", "active", "ca_9"),
      conn("gmail", "active", "ca_1"),
    ]);
    deepStrictEqual(
      grouped.map((g) => g.connection.toolkit),
      ["notion", "gmail"],
    );
  });
});
