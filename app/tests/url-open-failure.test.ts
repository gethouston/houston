import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { classifyQuietError } from "../src/lib/quiet-error-class.ts";
import {
  isNoBrowserFailure,
  planUrlOpenFailure,
  toUrlOpenFailure,
  UrlOpenError,
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

// PRODUCT-1814: the paths that keep the rejection (the codex loopback relay's
// `logAndReportError`) must classify a browserless machine as the quiet
// `no_url_handler` class off either shape, never file it as a bug.
describe("UrlOpenError / isNoBrowserFailure", () => {
  const noHandler = {
    kind: "no_handler",
    message: "Failed to open URL: ShellExecuteW failed (code 31)",
  };

  it("wraps the typed rejection as an Error that still reads its kind", () => {
    const err = new UrlOpenError(toUrlOpenFailure(noHandler));
    strictEqual(err.name, "UrlOpenError");
    strictEqual(err.message, noHandler.message);
    strictEqual(err.kind, "no_handler");
    deepStrictEqual(toUrlOpenFailure(err), noHandler);
  });

  it("names a missing browser off the raw object and the Error", () => {
    ok(isNoBrowserFailure(noHandler));
    ok(isNoBrowserFailure(new UrlOpenError(toUrlOpenFailure(noHandler))));
    strictEqual(classifyQuietError(noHandler), "no_url_handler");
    strictEqual(
      classifyQuietError(new UrlOpenError(toUrlOpenFailure(noHandler))),
      "no_url_handler",
    );
  });

  it("keeps every other open failure loud", () => {
    const other = new UrlOpenError(
      toUrlOpenFailure({
        kind: "other",
        message: "ShellExecuteW failed (code 8)",
      }),
    );
    ok(!isNoBrowserFailure(other));
    strictEqual(classifyQuietError(other), null);
    ok(!isNoBrowserFailure(new Error("ShellExecuteW failed (code 31)")));
  });
});
