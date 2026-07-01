import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSentryReportError } from "../src/lib/sentry-report-error.ts";

describe("createSentryReportError", () => {
  it("uses the command as the reported error name", () => {
    const error = createSentryReportError("read_agent_file", "Failed");

    assert.equal(error.name, "read_agent_file");
    assert.equal(error.message, "Failed");
  });

  it("preserves an original Error stack without mutating it", () => {
    const original = new Error("original");
    const originalStack = original.stack;
    const error = createSentryReportError("uncaught_error", "wrapped", original);

    assert.equal(original.name, "Error");
    assert.equal(error.name, "uncaught_error");
    assert.equal(error.stack, originalStack);
  });

  it("does not write to readonly Error-like values", () => {
    const original = Object.create(Error.prototype, {
      name: { get: () => "ReadonlyError" },
      message: { value: "readonly" },
      stack: { value: "ReadonlyError: readonly\n    at fake" },
    });

    const error = createSentryReportError("react_crash", "readonly", original);

    assert.equal(error.name, "react_crash");
    assert.equal(error.stack, original.stack);
  });

  it("does not throw when Error.prototype.name is a getter-only accessor", () => {
    // Reproduces HOU-461: in runtimes where `name` is exposed as a getter-only
    // accessor on the prototype, a plain `error.name = command` assignment
    // throws "Cannot set property name … which has only a getter" — inside the
    // reporter. The fix defines an own data property, which must still win.
    const descriptor = Object.getOwnPropertyDescriptor(Error.prototype, "name");
    Object.defineProperty(Error.prototype, "name", {
      configurable: true,
      get: () => "Error",
    });

    try {
      let error: Error | undefined;
      assert.doesNotThrow(() => {
        error = createSentryReportError("uncaught_error", "boom");
      });
      assert.equal(error?.name, "uncaught_error");
      assert.equal(error?.message, "boom");
    } finally {
      if (descriptor) {
        Object.defineProperty(Error.prototype, "name", descriptor);
      }
    }
  });
});
