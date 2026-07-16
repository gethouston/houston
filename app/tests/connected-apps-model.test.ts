import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { IntegrationConnection } from "@houston-ai/engine-client";
import { partitionConnections } from "../src/components/integrations/connected-apps-model.ts";

const conn = (
  toolkit: string,
  status: IntegrationConnection["status"] = "active",
): IntegrationConnection => ({ toolkit, connectionId: `c-${toolkit}`, status });

describe("partitionConnections", () => {
  it("splits active from pending/error, preserving order", () => {
    const connections = [
      conn("gmail", "active"),
      conn("slack", "pending"),
      conn("notion", "error"),
      conn("linear", "active"),
    ];
    const { active, recovering } = partitionConnections(connections);
    deepStrictEqual(
      active.map((c) => c.toolkit),
      ["gmail", "linear"],
    );
    deepStrictEqual(
      recovering.map((c) => c.toolkit),
      ["slack", "notion"],
    );
  });

  it("handles an empty list", () => {
    deepStrictEqual(partitionConnections([]), { active: [], recovering: [] });
  });
});
