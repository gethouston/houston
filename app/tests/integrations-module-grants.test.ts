import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  applyGrantChange,
  applyGrantChangeNullable,
  reverseGrantChange,
} from "../src/hooks/queries/grant-set.ts";

// The grant unit is the connected account (its connection id), not the toolkit.

describe("applyGrantChange", () => {
  it("add appends the connection id", () => {
    deepStrictEqual(
      applyGrantChange(["conn_a"], { connectionId: "conn_b", op: "add" }),
      ["conn_a", "conn_b"],
    );
  });

  it("add is idempotent (no duplicate ids)", () => {
    deepStrictEqual(
      applyGrantChange(["conn_a", "conn_b"], {
        connectionId: "conn_b",
        op: "add",
      }),
      ["conn_a", "conn_b"],
    );
  });

  it("remove drops only the connection id", () => {
    deepStrictEqual(
      applyGrantChange(["conn_a", "conn_b"], {
        connectionId: "conn_a",
        op: "remove",
      }),
      ["conn_b"],
    );
  });

  it("overlapping changes compose instead of resurrecting each other", () => {
    let cache = ["conn_a", "conn_c"];
    cache = applyGrantChange(cache, { connectionId: "conn_a", op: "remove" });
    cache = applyGrantChange(cache, { connectionId: "conn_b", op: "add" });
    deepStrictEqual(cache, ["conn_c", "conn_b"]);
  });
});

describe("reverseGrantChange", () => {
  it("rolls back an optimistic add", () => {
    deepStrictEqual(
      reverseGrantChange(["conn_a", "conn_b"], {
        connectionId: "conn_b",
        op: "add",
      }),
      ["conn_a"],
    );
  });

  it("only reverses its own change, leaving another mutation's intact", () => {
    let cache = ["conn_a"];
    cache = applyGrantChange(cache, { connectionId: "conn_b", op: "add" });
    cache = applyGrantChange(cache, { connectionId: "conn_c", op: "add" });
    cache = reverseGrantChange(cache, { connectionId: "conn_b", op: "add" });
    deepStrictEqual(cache, ["conn_a", "conn_c"]);
  });
});

describe("applyGrantChangeNullable (grants-unsupported null guard)", () => {
  it("leaves null untouched — never fabricates a set on an unsupported host", () => {
    strictEqual(
      applyGrantChangeNullable(null, { connectionId: "conn_b", op: "add" }),
      null,
    );
    strictEqual(
      applyGrantChangeNullable(null, { connectionId: "conn_a", op: "remove" }),
      null,
    );
  });

  it("applies the change normally over a real (possibly empty) set", () => {
    deepStrictEqual(
      applyGrantChangeNullable([], { connectionId: "conn_b", op: "add" }),
      ["conn_b"],
    );
    deepStrictEqual(
      applyGrantChangeNullable(["conn_a", "conn_b"], {
        connectionId: "conn_a",
        op: "remove",
      }),
      ["conn_b"],
    );
  });
});
