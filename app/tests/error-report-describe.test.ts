import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { describeError } from "../src/lib/describe-error.ts";

describe("describeError", () => {
  it("reads an Error's message and a string as itself", () => {
    strictEqual(describeError(new Error("boom")), "boom");
    strictEqual(describeError("raw text"), "raw text");
  });

  it("names a typed rejection as `kind: message`", () => {
    strictEqual(
      describeError({
        kind: "not_found",
        message: "Failed to save file: path not found (os error 3)",
      }),
      "not_found: Failed to save file: path not found (os error 3)",
    );
  });

  it("reads a message-only object as its message", () => {
    strictEqual(describeError({ message: "gone" }), "gone");
  });

  it("summarizes an object without a message, never [object Object]", () => {
    strictEqual(
      describeError({ code: 7, status: 409, detail: "secret@example.com" }),
      "object {code: 7, status: 409} keys: code, status, detail",
    );
  });

  it("never copies values outside the scalar whitelist", () => {
    const out = describeError({ email: "person@example.com", token: "abc" });
    strictEqual(out, "object keys: email, token");
  });

  it("clips a long whitelisted string and caps the key list", () => {
    const out = describeError({ name: "x".repeat(500) });
    strictEqual(out, `object {name: ${"x".repeat(80)}…} keys: name`);
    const many = Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [`k${i}`, i]),
    );
    strictEqual(describeError(many).endsWith(", …"), true);
  });

  it("survives a circular object", () => {
    const loop: Record<string, unknown> = { code: "E1" };
    loop.self = loop;
    strictEqual(describeError(loop), "object {code: E1} keys: code, self");
  });

  it("names an empty object", () => {
    strictEqual(describeError({}), "object");
  });

  it("stringifies primitives and nullish values", () => {
    strictEqual(describeError(undefined), "undefined");
    strictEqual(describeError(null), "null");
    strictEqual(describeError(42), "42");
  });
});
