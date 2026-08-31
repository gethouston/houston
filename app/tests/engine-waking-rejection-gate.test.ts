import { ok } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

// HOUSTON-APP-51C: a gateway waking 502 ("engine proxy failed") rejecting from
// a promise nobody catches — the mission-approve `tauriActivity.update` write
// hitting a pod mid engine-roll. The engine-call layer classified it as a
// waking state (PRODUCT-1403) and showed the deduped waking toast, but `call`
// rethrows and card handlers don't catch, so the same failure landed in
// `window.onunhandledrejection` — the last surface without the waking gate —
// and was re-captured to Sentry as `unhandled_rejection: engine proxy failed
// (engine error 502)`. Same layered-gate shape as the connectivity family
// (PRODUCT-1383 / PRODUCT-1392, see error-report-connectivity.test.ts).
//
// Asserted against the source rather than by calling the functions: both
// modules pull i18n / analytics / the tauri barrel, none of which load under
// this suite's `--experimental-strip-types` runner (same constraint and same
// pattern as error-report-connectivity.test.ts).

const read = (rel: string): string =>
  readFileSync(join(import.meta.dirname, rel), "utf8");

describe("global rejection handler declines engine-waking failures", () => {
  const source = read("../src/lib/global-error-handlers.ts");

  it("gates capture + red toast on isEngineWakingError", () => {
    ok(
      source.includes('from "./engine-waking-error"'),
      "global-error-handlers.ts must import the waking classifier",
    );
    const body = source.slice(source.indexOf("window.onunhandledrejection ="));
    const guard = body.indexOf("if (isEngineWakingError(event.reason))");
    const capture = body.indexOf("analytics.captureException");
    const redToast = body.indexOf("showErrorToast(");
    ok(guard !== -1, "the rejection handler must gate on engine waking");
    ok(
      body.indexOf("showEngineWakingToast(", guard) !== -1,
      "the waking branch must surface the deduped waking toast",
    );
    ok(
      capture === -1 || guard < capture,
      "the waking guard must run before the exception capture",
    );
    ok(
      redToast === -1 || guard < redToast,
      "the waking guard must run before the red error toast",
    );
  });
});

describe("reportError declines engine-waking failures", () => {
  const source = read("../src/lib/error-report.ts");

  it("gates the Sentry capture on isEngineWakingError", () => {
    ok(
      source.includes('from "./engine-waking-error"'),
      "error-report.ts must import the waking classifier",
    );
    const body = source.slice(source.indexOf("export function reportError("));
    const guard = body.indexOf(
      "if (isEngineWakingError(originalError)) return;",
    );
    const capture = body.indexOf("sentryCapture");
    ok(guard !== -1, "reportError must decline engine-waking errors");
    ok(
      capture === -1 || guard < capture,
      "the waking guard must run before the Sentry capture",
    );
  });
});
