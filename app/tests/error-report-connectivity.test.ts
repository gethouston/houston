import { ok } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

// PRODUCT-1383 (HOUSTON-APP-4PQ): a device-offline drop during a provider
// sign-out was re-captured to Sentry by the caller-authored-toast layer
// (`reportError`) after the engine-call layer had already classified the same
// failure as connectivity (HOU-1085) and deliberately declined the capture —
// 859 events / 171 users of pure "user was offline" noise, plus a red
// "sign out failed" toast stacked on the connectivity toast.
//
// PRODUCT-1640 flipped the Sentry half: the gate no longer DECLINES capture,
// it routes the class to the low-noise fingerprinted capture
// (`reportQuietError`), so an offline drop's raw diagnostic is findable in ONE
// `offline` issue while the red toast and per-event issues stay gone.
//
// Asserted against the source rather than by calling the functions: both
// modules pull i18n / analytics / the tauri barrel, none of which load under
// this suite's `--experimental-strip-types` runner (same constraint and same
// pattern as error-toast-not-shown.test.ts).

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
  // PRODUCT-1392 (HOUSTON-APP-4PG): a transport TypeError rejecting from a
  // promise nobody catches (the `/v1/events` stream dropping on device
  // offline) landed in `window.onunhandledrejection`, which was the last
  // surface without the HOU-1085 gate — 2,331 events / 151 users of
  // `unhandled_rejection: Load failed`, with the red toast, on builds where
  // both other layers were already gated.
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
  // The engine-call layer (`surfaceError` in lib/tauri.ts) shows the ONE
  // deduped connectivity toast for these failures; the hook's authored red
  // toast must stay quiet for them in every action (connect / cancel /
  // sign-out — all three share the offline failure mode).
  const source = read(
    "../src/hooks/provider-connections/use-provider-connect-actions.ts",
  );

  it("gates every authored failure toast on isNetworkTransportError", () => {
    ok(
      source.includes('from "../../lib/network-transport-error"'),
      "the hook must import the connectivity classifier",
    );
    const toasts = source.split("addToast({").length - 1;
    const guards =
      source.split("if (!isNetworkTransportError(err))").length - 1;
    ok(toasts > 0, "expected authored failure toasts in the hook");
    ok(
      guards === toasts,
      `every addToast must be connectivity-gated (${guards} guards for ${toasts} toasts)`,
    );
  });
});
