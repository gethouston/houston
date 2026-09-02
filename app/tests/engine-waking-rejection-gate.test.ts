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
// PRODUCT-1640 flipped the Sentry half: the gate no longer DECLINES capture,
// it routes the class to the low-noise fingerprinted capture
// (`reportQuietError`), so the raw gateway body is findable in ONE
// `engine_waking` issue while the red toast and per-event issues stay gone.
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
      body.indexOf(
        'showEngineWakingToast("unhandled_rejection", message, event.reason)',
        guard,
      ) !== -1,
      "the waking branch must surface the deduped waking toast WITH the rejection, so the toast layer can capture it low-noise",
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

describe("reportError routes engine-waking failures to the quiet capture", () => {
  const source = read("../src/lib/error-report.ts");

  it("gates the per-event Sentry capture on classifyQuietError", () => {
    ok(
      source.includes('from "./quiet-error-class"') &&
        source.includes('from "./quiet-error-report"'),
      "error-report.ts must import the quiet classifier and the quiet report",
    );
    const body = source.slice(source.indexOf("export function reportError("));
    const guard = body.indexOf("classifyQuietError(originalError)");
    const quiet = body.indexOf(
      "reportQuietError(quiet, command, message, originalError)",
    );
    const capture = body.indexOf("sentryCapture");
    ok(guard !== -1, "reportError must classify quiet errors");
    ok(quiet !== -1, "a quiet class must take the fingerprinted capture");
    ok(
      capture === -1 || guard < capture,
      "the quiet guard must run before the per-event Sentry capture",
    );
    ok(
      !body.includes("isEngineWakingError(originalError)) return"),
      "a waking answer must never be declined outright again (PRODUCT-1640)",
    );
  });
});

describe("the waking toast captures low-noise", () => {
  const source = read("../src/lib/error-toast.ts");

  it("showEngineWakingToast reports the quiet class before the dedupe", () => {
    const body = source.slice(
      source.indexOf("export function showEngineWakingToast("),
    );
    const report = body.indexOf(
      'reportQuietError("engine_waking", command, message, originalError, context)',
    );
    const dedupe = body.indexOf("errorBurst.isFirst(");
    ok(report !== -1, "the waking toast must capture the quiet class");
    ok(
      dedupe === -1 || report < dedupe,
      "the capture must run before the toast dedupe, which drops repeats",
    );
  });
});

describe("the quiet capture pins its grouping", () => {
  const source = read("../src/lib/quiet-error-report.ts");

  it("fingerprints on the class alone, at warning level", () => {
    ok(
      source.includes("fingerprint: [kind]"),
      "the class must be the whole fingerprint — one issue per class",
    );
    ok(source.includes('level: "warning"'), "the class captures as a warning");
    ok(
      source.includes('fingerprint: ["waking_stuck"]') &&
        source.includes('level: "error"'),
      "the stuck-wake escalation must be its own error-level issue",
    );
  });
});
