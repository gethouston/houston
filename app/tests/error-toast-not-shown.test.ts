import { ok } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

// HOU-1245: `showErrorToast` reports an unexpected error but shows the user
// NOTHING — the red "Houston, we have a problem!" box and the green "report
// sent / Copy code" follow-up are both gone. Every reporting path stays.
//
// Asserted against the source rather than by calling the function: `error-toast`
// pulls the `@houston-ai/engine-client` barrel and the Zustand store, neither of
// which loads under this suite's `--experimental-strip-types` runner. The
// invariant is worth a structural guard anyway — re-adding an `addToast` here is
// a one-line change that no other test in the repo would catch.

const SOURCE = readFileSync(
  join(import.meta.dirname, "../src/lib/error-toast.ts"),
  "utf8",
);

/** The text of one exported function, from its signature to the next export. */
function bodyOf(name: string): string {
  const start = SOURCE.indexOf(`export function ${name}(`);
  ok(start !== -1, `${name} not found in error-toast.ts`);
  const rest = SOURCE.slice(start + 1);
  const end = rest.indexOf("\nexport ");
  return end === -1 ? rest : rest.slice(0, end);
}

describe("showErrorToast shows the user nothing", () => {
  const body = bodyOf("showErrorToast");

  it("adds no toast of any kind", () => {
    ok(!body.includes("addToast"), "showErrorToast must not add a toast");
  });

  it("does not resurrect the red or green toast copy", () => {
    for (const key of [
      "problemTitle",
      "reportSentTitle",
      "reportSentDescription",
      "copyId",
    ]) {
      ok(!body.includes(key), `errorToast.${key} is retired copy`);
    }
  });

  it("still reports to Sentry, PostHog, and the frontend log", () => {
    ok(body.includes("sentryCapture"), "Sentry capture must survive");
    ok(
      body.includes('analytics.track("app_error_shown"'),
      "PostHog must survive",
    );
    ok(body.includes("console.error"), "frontend log must survive");
  });
});

describe("the informational toasts are untouched", () => {
  // These are expected, explainable states with authored copy — NOT the generic
  // bug pair — and they must keep reaching the user.
  for (const name of [
    "showExpectedStateToast",
    "showConnectivityErrorToast",
    "showEngineWakingToast",
  ]) {
    it(`${name} still shows a toast`, () => {
      ok(bodyOf(name).includes("addToast"), `${name} must still toast`);
    });
  }
});
