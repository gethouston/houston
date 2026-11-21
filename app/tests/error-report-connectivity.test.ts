import { ok } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const read = (rel: string): string =>
  readFileSync(join(import.meta.dirname, rel), "utf8");

describe("reportError routes connectivity failures to the quiet capture", () => {
  const source = read("../src/lib/error-report.ts");

  it("gates the per-event Sentry capture on classifyQuietError", () => {
    ok(
      source.includes('from "./quiet-error-class"'),
      "error-report.ts must import the quiet classifier",
    );
    const body = source.slice(source.indexOf("export function reportError("));
    const guard = body.indexOf("classifyQuietError(originalError)");
    const capture = body.indexOf("sentryCapture");
    ok(guard !== -1, "reportError must classify quiet errors");
    ok(
      capture === -1 || guard < capture,
      "the quiet guard must run before the per-event Sentry capture",
    );
    ok(
      !body.includes("isNetworkTransportError(originalError)) return"),
      "an offline drop must never be declined outright again (PRODUCT-1640)",
    );
  });
});

describe("the connectivity toast captures low-noise", () => {
  const source = read("../src/lib/error-toast.ts");

  it("showConnectivityErrorToast reports the quiet class before the dedupe", () => {
    const body = source.slice(
      source.indexOf("export function showConnectivityErrorToast("),
    );
    const report = body.indexOf(
      'reportQuietError("offline", command, message, originalError)',
    );
    const dedupe = body.indexOf("errorBurst.isFirst(");
    ok(report !== -1, "the connectivity toast must capture the quiet class");
    ok(
      dedupe === -1 || report < dedupe,
      "the capture must run before the toast dedupe, which drops repeats",
    );
  });
});

describe("global rejection handler declines connectivity failures", () => {
  const source = read("../src/lib/global-error-handlers.ts");

  it("gates capture + red toast on isNetworkTransportError", () => {
    ok(
      source.includes('from "./network-transport-error"'),
      "global-error-handlers.ts must import the connectivity classifier",
    );
    const body = source.slice(source.indexOf("window.onunhandledrejection ="));
    const guard = body.indexOf("if (isNetworkTransportError(event.reason))");
    const capture = body.indexOf("analytics.captureException");
    const redToast = body.indexOf("showErrorToast(");
    ok(guard !== -1, "the rejection handler must gate on connectivity");
    ok(
      body.indexOf(
        'showConnectivityErrorToast("unhandled_rejection", message, event.reason)',
        guard,
      ) !== -1,
      "the connectivity branch must surface the deduped connectivity toast WITH the rejection, so the toast layer can capture it low-noise",
    );
    ok(
      capture === -1 || guard < capture,
      "the connectivity guard must run before the exception capture",
    );
    ok(
      redToast === -1 || guard < redToast,
      "the connectivity guard must run before the red error toast",
    );
  });
});

describe("provider connect actions do not double-surface connectivity", () => {
  const source = read(
    "../src/hooks/provider-connections/use-provider-connect-actions.ts",
  );

  it("gates every authored failure toast on isNetworkTransportError", () => {
    ok(
      source.includes('from "../../lib/network-transport-error"'),
      "the hook must import the connectivity classifier",
    );
    const toasts = source.split("addToast({").length - 1;
    const guards = (
      source.match(/if \(\s*!isNetworkTransportError\(err\)/g) ?? []
    ).length;
    ok(toasts > 0, "expected authored failure toasts in the hook");
    ok(
      guards === toasts,
      `every addToast must be connectivity-gated (${guards} guards for ${toasts} toasts)`,
    );
  });
});
