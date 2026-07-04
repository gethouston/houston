import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  applyGrantChange,
  applyGrantChangeNullable,
  reverseGrantChange,
} from "../src/hooks/queries/grant-set.ts";

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

  it("overlapping changes compose instead of resurrecting each other", () => {
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

  it("only reverses its own change, leaving another mutation's intact", () => {
    let cache = ["gmail"];
    cache = applyGrantChange(cache, { toolkit: "slack", op: "add" });
    cache = applyGrantChange(cache, { toolkit: "notion", op: "add" });
    cache = reverseGrantChange(cache, { toolkit: "slack", op: "add" });
    deepStrictEqual(cache, ["gmail", "notion"]);
  });
});

describe("applyGrantChangeNullable (grants-unsupported null guard)", () => {
  it("leaves null untouched — never fabricates a set on an unsupported host", () => {
    strictEqual(
      applyGrantChangeNullable(null, { toolkit: "slack", op: "add" }),
      null,
    );
    strictEqual(
      applyGrantChangeNullable(null, { toolkit: "gmail", op: "remove" }),
      null,
    );
  });

  it("applies the change normally over a real (possibly empty) set", () => {
    deepStrictEqual(
      applyGrantChangeNullable([], { toolkit: "slack", op: "add" }),
      ["slack"],
    );
    deepStrictEqual(
      applyGrantChangeNullable(["gmail", "slack"], {
        toolkit: "gmail",
        op: "remove",
      }),
      ["slack"],
    );
  });
});
