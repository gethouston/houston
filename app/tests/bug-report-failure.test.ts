import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  BugReportError,
  isBugIntakeUnavailable,
  toBugReportFailure,
} from "../src/lib/bug-report-failure.ts";
import { classifyQuietError } from "../src/lib/quiet-error-class.ts";

describe("toBugReportFailure", () => {
  it("reads the shell's typed rejection", () => {
    deepStrictEqual(
      toBugReportFailure({
        kind: "intake_unavailable",
        message: "Linear API returned GraphQL errors: usage limit exceeded",
      }),
      {
        kind: "intake_unavailable",
        message: "Linear API returned GraphQL errors: usage limit exceeded",
      },
    );
  });

  it("wraps a plain string (an older shell) as `other`", () => {
    deepStrictEqual(
      toBugReportFailure(
        "Linear API returned GraphQL errors: usage limit exceeded",
      ),
      {
        kind: "other",
        message: "Linear API returned GraphQL errors: usage limit exceeded",
      },
    );
  });

  it("reads `kind` off an Error (the web shim's typed refusal)", () => {
    const err = Object.assign(new Error("usage limit exceeded"), {
      kind: "intake_unavailable",
    });
    strictEqual(toBugReportFailure(err).kind, "intake_unavailable");
  });

  it("treats an unknown kind as `other`", () => {
    strictEqual(
      toBugReportFailure({ kind: "nope", message: "x" }).kind,
      "other",
    );
  });
});

describe("BugReportError", () => {
  it("keeps the diagnostic as its message and the kind readable", () => {
    const err = new BugReportError({
      kind: "intake_unavailable",
      message: "Linear API returned GraphQL errors: usage limit exceeded",
    });
    ok(err instanceof Error);
    strictEqual(
      err.message,
      "Linear API returned GraphQL errors: usage limit exceeded",
    );
    ok(isBugIntakeUnavailable(err));
  });
});

describe("classifyQuietError", () => {
  it("names the intake refusal as its quiet class", () => {
    strictEqual(
      classifyQuietError(
        new BugReportError({ kind: "intake_unavailable", message: "m" }),
      ),
      "bug_intake_unavailable",
    );
  });

  it("leaves any other intake failure on the report path", () => {
    strictEqual(
      classifyQuietError(new BugReportError({ kind: "other", message: "m" })),
      null,
    );
  });
});
