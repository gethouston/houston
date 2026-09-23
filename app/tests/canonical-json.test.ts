import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { canonicalJson } from "../src/lib/canonical-json.ts";

describe("canonicalJson", () => {
  it("sorts an object's keys, whatever order they were built in", () => {
    strictEqual(
      canonicalJson({ b: 1, a: 2, c: 3 }),
      canonicalJson({ c: 3, a: 2, b: 1 }),
    );
    strictEqual(canonicalJson({ b: 1, a: 2 }), '{"a":2,"b":1}');
  });

  it("sorts at every depth, inside arrays too", () => {
    strictEqual(
      canonicalJson({ outer: [{ z: 1, a: { y: 2, x: 3 } }] }),
      canonicalJson({ outer: [{ a: { x: 3, y: 2 }, z: 1 }] }),
    );
  });

  it("keeps array order, which is meaningful", () => {
    strictEqual(canonicalJson([1, 2]) === canonicalJson([2, 1]), false);
  });

  it("omits undefined properties, exactly as JSON.stringify does", () => {
    strictEqual(canonicalJson({ a: 1, b: undefined }), '{"a":1}');
    strictEqual(canonicalJson({ a: 1 }), canonicalJson({ a: 1, b: undefined }));
  });

  it("writes an undefined array hole as null, exactly as JSON.stringify does", () => {
    strictEqual(canonicalJson([1, undefined, 2]), "[1,null,2]");
  });

  it("passes primitives and null through", () => {
    strictEqual(canonicalJson(null), "null");
    strictEqual(canonicalJson(7), "7");
    strictEqual(canonicalJson("hi"), '"hi"');
    strictEqual(canonicalJson(true), "true");
  });

  it("never reads a value JSON cannot represent as some other value's JSON", () => {
    // `JSON.stringify(undefined)` is `undefined`, not a string; the sentinel
    // has to stay outside the range of real output.
    strictEqual(canonicalJson(undefined), "undefined");
    strictEqual(canonicalJson("undefined") === canonicalJson(undefined), false);
  });
});
