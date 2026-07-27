import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { IntegrationConnection } from "@houston-ai/engine-client";
import {
  catalogHiddenToolkits,
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

  it("also hides a connection the agent's ceiling forbids (it has a section of its own)", () => {
    const hidden = catalogHiddenToolkits(
      [conn("gmail", "active"), conn("slack", "error"), conn("jira", "error")],
      ["slack"],
    );
    deepStrictEqual([...hidden].sort(), ["gmail", "jira"]);
  });

  it("hides nothing extra without a ceiling", () => {
    const hidden = catalogHiddenToolkits([conn("slack", "pending")], null);
    strictEqual(hidden.size, 0);
  });
});
