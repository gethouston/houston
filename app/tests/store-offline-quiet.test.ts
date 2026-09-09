import { ok } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

// PRODUCT-1735 (HOUSTON-APP-54J / 55K): the store screens hand their raw
// TanStack query error to `showErrorToast`, and an anonymous catalog read
// never passes through `call()` — so the engine-call layer's quiet-class
// gate never saw it, and 36 users browsing the store offline were captured as
// "store browse fetch failed" bugs. `showErrorToast` is the last reporting
// surface without the gate; this pins it in, ahead of the per-event capture.
//
// Asserted against the source: `error-toast` pulls i18n and the Zustand
// store, neither of which loads under this suite's runner (same constraint as
// error-toast-not-shown.test.ts).

const read = (rel: string): string =>
  readFileSync(join(import.meta.dirname, rel), "utf8");

describe("showErrorToast routes the quiet classes to their own surfaces", () => {
  const source = read("../src/lib/error-toast.ts");
  const body = source.slice(source.indexOf("export function showErrorToast("));

  it("classifies before the per-event Sentry capture", () => {
    ok(source.includes('from "./quiet-error-class"'));
    const guard = body.indexOf("classifyQuietError(originalError)");
    const capture = body.indexOf("sentryCapture(");
    ok(guard !== -1, "showErrorToast must classify quiet errors");
    ok(capture !== -1, "every other failure keeps its per-event capture");
    ok(guard < capture, "the quiet guard must run before the capture");
  });

  it("keeps each class on its existing informational surface", () => {
    ok(
      body.includes(
        "showConnectivityErrorToast(command, message, originalError)",
      ),
    );
    ok(body.includes("showEngineWakingToast(command, message, originalError)"));
    ok(body.includes('reportQuietError("bridge_unsupported"'));
  });
});

describe("the store screens report through the gated surface", () => {
  for (const [rel, command] of [
    ["../src/components/store-view/store-browse.tsx", "store_browse"],
    ["../src/components/store-view/store-detail-pane.tsx", "store_detail"],
    [
      "../src/components/store-view/creator/creator-profile-pane.tsx",
      "store_creator",
    ],
  ]) {
    it(`${command} uses showErrorToast`, () => {
      const source = read(rel);
      ok(
        source.includes(`showErrorToast(\n        "${command}"`) ||
          source.includes(`showErrorToast("${command}"`),
      );
    });
  }
});
