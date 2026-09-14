import { ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  isNoUrlHandlerError,
  OpenUrlError,
  toOpenUrlError,
} from "../src/lib/open-url-failure.ts";
import { classifyQuietError } from "../src/lib/quiet-error-class.ts";

// PRODUCT-1814: the shell's `open_url` rejects typed; a machine with no
// default browser (Windows ShellExecuteW code 31) is a quiet class with a
// remedy toast, never a per-user Sentry bug.
describe("toOpenUrlError", () => {
  it("reads the shell's typed rejection", () => {
    const err = toOpenUrlError({
      kind: "no_handler",
      message: "Failed to open URL: ShellExecuteW failed (code 31)",
    });
    ok(err instanceof OpenUrlError);
    strictEqual(err.kind, "no_handler");
    strictEqual(
      err.message,
      "Failed to open URL: ShellExecuteW failed (code 31)",
    );
    strictEqual(err.name, "OpenUrlError");
  });

  it("wraps a plain string (an older shell) as `other`", () => {
    const err = toOpenUrlError(
      "Failed to open URL: ShellExecuteW failed (code 5)",
    );
    strictEqual(err.kind, "other");
    strictEqual(
      err.message,
      "Failed to open URL: ShellExecuteW failed (code 5)",
    );
  });

  it("wraps a thrown Error as `other` and keeps its message", () => {
    strictEqual(toOpenUrlError(new Error("boom")).kind, "other");
    strictEqual(toOpenUrlError(new Error("boom")).message, "boom");
  });

  it("refuses an unknown kind rather than trusting the wire", () => {
    strictEqual(toOpenUrlError({ kind: "nope", message: "x" }).kind, "other");
  });

  it("passes an already-wrapped error through", () => {
    const err = new OpenUrlError("no_handler", "x");
    strictEqual(toOpenUrlError(err), err);
  });
});

describe("isNoUrlHandlerError / classifyQuietError", () => {
  it("names only the no-handler kind", () => {
    const missing = new OpenUrlError(
      "no_handler",
      "ShellExecuteW failed (code 31)",
    );
    ok(isNoUrlHandlerError(missing));
    strictEqual(classifyQuietError(missing), "no_url_handler");
    const other = new OpenUrlError("other", "ShellExecuteW failed (code 8)");
    ok(!isNoUrlHandlerError(other));
    strictEqual(classifyQuietError(other), null);
    ok(!isNoUrlHandlerError(new Error("ShellExecuteW failed (code 31)")));
  });
});
