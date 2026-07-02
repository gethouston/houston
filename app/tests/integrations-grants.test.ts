import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { IntegrationConnection } from "@houston-ai/engine-client";
import { splitByGrant } from "../src/components/tabs/integrations-tab-model.ts";

const conn = (
  toolkit: string,
  status: IntegrationConnection["status"] = "active",
): IntegrationConnection => ({
  toolkit,
  connectionId: `ca_${toolkit}`,
  status,
});

const CONNECTIONS: IntegrationConnection[] = [
  conn("gmail"),
  conn("slack", "pending"),
  conn("notion", "error"),
  conn("googlecalendar"),
];

describe("splitByGrant", () => {
  it("puts granted connections under granted, the rest under available", () => {
    const { granted, available } = splitByGrant({
      connections: CONNECTIONS,
      grants: new Set(["gmail", "notion"]),
    });
    deepStrictEqual(
      granted.map((c) => c.toolkit),
      ["gmail", "notion"],
    );
    deepStrictEqual(
      available.map((c) => c.toolkit),
      ["slack", "googlecalendar"],
    );
  });

  it("grants apply regardless of connection status (active/pending/error)", () => {
    const { granted } = splitByGrant({
      connections: CONNECTIONS,
      grants: new Set(["slack", "notion"]),
    });
    deepStrictEqual(
      granted.map((c) => `${c.toolkit}:${c.status}`),
      ["slack:pending", "notion:error"],
    );
  });

  it("empty grant set → everything available, nothing granted", () => {
    const { granted, available } = splitByGrant({
      connections: CONNECTIONS,
      grants: new Set(),
    });
    deepStrictEqual(granted, []);
    deepStrictEqual(
      available.map((c) => c.toolkit),
      ["gmail", "slack", "notion", "googlecalendar"],
    );
  });

  it("a grant with no matching connection is ignored (grant needs a connection)", () => {
    const { granted, available } = splitByGrant({
      connections: [conn("gmail")],
      grants: new Set(["gmail", "dropbox"]),
    });
    deepStrictEqual(
      granted.map((c) => c.toolkit),
      ["gmail"],
    );
    deepStrictEqual(available, []);
  });

  it("preserves connection order within each bucket", () => {
    const { granted, available } = splitByGrant({
      connections: [conn("z"), conn("a"), conn("m"), conn("b")],
      grants: new Set(["z", "m"]),
    });
    deepStrictEqual(
      granted.map((c) => c.toolkit),
      ["z", "m"],
    );
    deepStrictEqual(
      available.map((c) => c.toolkit),
      ["a", "b"],
    );
  });
});
