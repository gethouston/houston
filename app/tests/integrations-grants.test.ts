import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { IntegrationConnection } from "@houston-ai/engine-client";
import { splitByGrant } from "../src/components/tabs/integrations-tab-model.ts";
import {
  applyGrantChange,
  reverseGrantChange,
} from "../src/hooks/queries/grant-set.ts";

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

describe("applyGrantChange", () => {
  it("add appends the toolkit", () => {
    deepStrictEqual(
      applyGrantChange(["gmail"], { toolkit: "slack", op: "add" }),
      ["gmail", "slack"],
    );
  });

  it("add is idempotent (no duplicate slugs)", () => {
    deepStrictEqual(
      applyGrantChange(["gmail", "slack"], { toolkit: "slack", op: "add" }),
      ["gmail", "slack"],
    );
  });

  it("remove drops only the toolkit", () => {
    deepStrictEqual(
      applyGrantChange(["gmail", "slack"], { toolkit: "gmail", op: "remove" }),
      ["slack"],
    );
  });

  it("remove of an absent toolkit is a no-op", () => {
    deepStrictEqual(
      applyGrantChange(["gmail"], { toolkit: "slack", op: "remove" }),
      ["gmail"],
    );
  });

  it("never mutates the input array", () => {
    const current = ["gmail"];
    applyGrantChange(current, { toolkit: "slack", op: "add" });
    applyGrantChange(current, { toolkit: "gmail", op: "remove" });
    deepStrictEqual(current, ["gmail"]);
  });

  it("overlapping changes compose instead of resurrecting each other", () => {
    // Two quick toggles: revoke gmail, then allow slack — the second change is
    // applied on top of the first's result, not on a stale snapshot.
    let cache = ["gmail", "notion"];
    cache = applyGrantChange(cache, { toolkit: "gmail", op: "remove" });
    cache = applyGrantChange(cache, { toolkit: "slack", op: "add" });
    deepStrictEqual(cache, ["notion", "slack"]);
  });
});

describe("reverseGrantChange", () => {
  it("rolls back an optimistic add", () => {
    deepStrictEqual(
      reverseGrantChange(["gmail", "slack"], { toolkit: "slack", op: "add" }),
      ["gmail"],
    );
  });

  it("rolls back an optimistic remove", () => {
    deepStrictEqual(
      reverseGrantChange(["gmail"], { toolkit: "slack", op: "remove" }),
      ["gmail", "slack"],
    );
  });

  it("only reverses its own change, leaving another mutation's intact", () => {
    // A added slack, B added notion, A fails: rolling back A keeps B's add.
    let cache = ["gmail"];
    cache = applyGrantChange(cache, { toolkit: "slack", op: "add" });
    cache = applyGrantChange(cache, { toolkit: "notion", op: "add" });
    cache = reverseGrantChange(cache, { toolkit: "slack", op: "add" });
    deepStrictEqual(cache, ["gmail", "notion"]);
  });
});
