import { ok, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { isAgentWarmingRefusal } from "../src/lib/agent-warming-refusal.ts";

// PRODUCT-1666 (HOUSTON-APP-53K): the warming guard's own refusal (HOU-693) is
// a deliberate "not yet" with the "almost ready" dialog as its surface. A
// caller's generic catch funnelled it through `genericErrorDescription`, which
// showed a red "couldn't start" toast AND captured a Sentry error whose message
// was the dialog's localized copy. The reporting layer must decline it, the
// same way the global rejection handler always has.

const read = (rel: string): string =>
  readFileSync(join(import.meta.dirname, rel), "utf8");

describe("isAgentWarmingRefusal", () => {
  it("matches the guard's error by name, whichever module minted it", () => {
    const err = new Error("Almost ready.");
    err.name = "AgentWarmingError";
    strictEqual(isAgentWarmingRefusal(err), true);
  });

  it("never matches anything else", () => {
    strictEqual(isAgentWarmingRefusal(new Error("Almost ready.")), false);
    strictEqual(isAgentWarmingRefusal("AgentWarmingError"), false);
    strictEqual(isAgentWarmingRefusal(null), false);
  });
});

describe("the guard mints the name the predicate matches", () => {
  const source = read("../src/lib/agent-warming-guard.ts");

  it("uses the shared name constant and delegates its own predicate", () => {
    ok(source.includes("this.name = AGENT_WARMING_ERROR_NAME;"));
    ok(source.includes("return isAgentWarmingRefusal(e);"));
  });
});

// Asserted against the source: both reporting modules pull i18n / analytics,
// which do not load under this suite's `--experimental-strip-types` runner
// (same pattern as error-report-connectivity.test.ts).
describe("the reporting layer declines the warming refusal", () => {
  it("reportError returns before any Sentry capture", () => {
    const source = read("../src/lib/error-report.ts");
    const body = source.slice(source.indexOf("export function reportError("));
    const guard = body.indexOf("if (isAgentWarmingRefusal(originalError))");
    ok(guard !== -1, "reportError must gate on the warming refusal");
    ok(guard < body.indexOf("reportQuietError"));
    ok(guard < body.indexOf("sentryCapture"));
  });

  it("showErrorToast returns before any Sentry capture", () => {
    const source = read("../src/lib/error-toast.ts");
    const body = source.slice(
      source.indexOf("export function showErrorToast("),
    );
    const guard = body.indexOf("if (isAgentWarmingRefusal(originalError))");
    ok(guard !== -1, "showErrorToast must gate on the warming refusal");
    ok(guard < body.indexOf("sentryCapture"));
  });
});

describe("the custom-integration chat keeps its red toast for real failures only", () => {
  const source = read(
    "../src/components/integrations/use-integration-chat-setup.ts",
  );

  it("gates every authored failure toast on isAgentWarmingError", () => {
    ok(source.includes('from "../../lib/agent-warming-guard"'));
    const toasts = source.split("custom.setupChat.startError").length - 1;
    const guards = (
      source.match(/if \(isAgentWarmingError\(err\)\) return;/g) ?? []
    ).length;
    ok(toasts > 0, "expected authored failure toasts in the hook");
    strictEqual(guards, toasts);
  });
});
