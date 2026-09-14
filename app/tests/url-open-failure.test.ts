import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  planUrlOpenFailure,
  toUrlOpenFailure,
} from "../src/lib/url-open-failure.ts";

// HOUSTON-APP-5ES: the shell's open_url rejects typed; a machine with no
// default browser becomes informational copy with no Sentry report, and only
// `other` still goes down the report path.
describe("toUrlOpenFailure", () => {
  it("reads the shell's typed rejection", () => {
    deepStrictEqual(
      toUrlOpenFailure({
        kind: "no_handler",
        message: "Failed to open URL: ShellExecuteW failed (code 31)",
      }),
      {
        kind: "no_handler",
        message: "Failed to open URL: ShellExecuteW failed (code 31)",
      },
    );
  });

  it("wraps a plain string (an older shell) as `other`", () => {
    deepStrictEqual(
      toUrlOpenFailure("Failed to open URL: ShellExecuteW failed (code 31)"),
      {
        kind: "other",
        message: "Failed to open URL: ShellExecuteW failed (code 31)",
      },
    );
  });

  it("wraps a thrown Error and an unknown kind as `other`", () => {
    strictEqual(toUrlOpenFailure(new Error("boom")).kind, "other");
    strictEqual(
      toUrlOpenFailure({ kind: "teapot", message: "x" }).kind,
      "other",
    );
    strictEqual(toUrlOpenFailure(null).kind, "other");
  });
});

describe("planUrlOpenFailure", () => {
  it("routes a missing browser to the expected-state copy", () => {
    const plan = planUrlOpenFailure({
      kind: "no_handler",
      message: "Failed to open URL: ShellExecuteW failed (code 31)",
    });
    strictEqual(plan.surface, "expected");
    if (plan.surface === "expected") strictEqual(plan.copy, "noBrowser");
  });

  it("reports everything else", () => {
    strictEqual(
      planUrlOpenFailure({ kind: "other", message: "code 5" }).surface,
      "report",
    );
    strictEqual(planUrlOpenFailure(new Error("boom")).surface, "report");
  });
});
