import { beforeEach, expect, test, vi } from "vitest";

/**
 * HOU-818: every "couldn't send your bug report" toast used to be a
 * console.error and nothing more. The one failure we most need to hear about
 * was the one that reported itself the least. `genericErrorDescription` — the
 * body of those ad-hoc error toasts (Settings → Report bug, the shell's
 * feedback dialog, and ~40 other handlers) — now captures to Sentry on the way
 * past, and `logAndReportError` gives handlers with their own authored copy
 * (the provider-error cards' report button) the same reach.
 */

const { captureException, addToast } = vi.hoisted(() => ({
  captureException: vi.fn(async () => "event-id"),
  addToast: vi.fn(),
}));

vi.mock("@houston/app/lib/sentry", () => ({
  captureException,
  sentrySuppressedInDev: false,
}));
vi.mock("@houston/app/lib/analytics", () => ({
  analytics: { track: vi.fn() },
  classifyAnalyticsError: () => "unknown",
}));
vi.mock("@houston/app/lib/i18n", () => ({
  default: { t: (key: string) => key },
}));
vi.mock("@houston/app/stores/ui", () => ({
  useUIStore: { getState: () => ({ addToast }) },
}));

import {
  genericErrorDescription,
  logAndReportError,
} from "@houston/app/lib/error-report";
import { showErrorToast } from "@houston/app/lib/error-toast";

beforeEach(() => {
  captureException.mockClear();
  addToast.mockClear();
});

test("a failed feedback submission reaches Sentry, tagged with its command", async () => {
  const failure = new Error("feedback failed (501)");

  const body = genericErrorDescription("manual_report", failure);

  // The user still reads friendly product copy, never the raw diagnostic.
  expect(body).toBe("shell:errorToast.genericDescription");
  expect(captureException).toHaveBeenCalledTimes(1);
  const [error, context] = captureException.mock.calls[0] as [
    Error,
    { source: string },
  ];
  expect(error.name).toBe("manual_report");
  expect(error.message).toBe("feedback failed (501)");
  expect(context.source).toBe("manual_report");
  // Reporting is not toasting: the caller owns the toast it shows.
  expect(addToast).not.toHaveBeenCalled();
});

test("logAndReportError reports without toasting over the caller's copy", () => {
  logAndReportError("report_bug", new Error("plain failure"));

  expect(captureException).toHaveBeenCalledTimes(1);
  const [error] = captureException.mock.calls[0] as [Error];
  expect(error.name).toBe("report_bug");
  expect(error.message).toBe("plain failure");
  expect(addToast).not.toHaveBeenCalled();
});

test("an error the call() layer already surfaced is not captured twice", async () => {
  // What `call()` does on any engine failure: toast + capture. It stamps the
  // thrown error, so the handler that ALSO feeds it to genericErrorDescription
  // for its toast body (create-workspace dialog, provider connect actions)
  // files no second Sentry issue for the same failure.
  const failure = new Error("Engine error 500");
  showErrorToast("create_workspace", failure.message, failure);
  await Promise.resolve();
  expect(captureException).toHaveBeenCalledTimes(1);

  const body = genericErrorDescription("create_workspace", failure);

  expect(body).toBe("shell:errorToast.genericDescription");
  expect(captureException).toHaveBeenCalledTimes(1);
});

test("a fresh error from a non-call() path still reports", () => {
  // Clipboard writes, the raw report_bug invoke, os-bridge calls: nothing
  // captured these before, and that reach is the point of HOU-818.
  logAndReportError("copy_to_clipboard", new Error("write denied"));

  expect(captureException).toHaveBeenCalledTimes(1);
});

test("a non-Error rejection still reports a readable reason", () => {
  genericErrorDescription("user_feedback", { status: 501 });

  const [error] = captureException.mock.calls[0] as [Error];
  expect(error.message).toBe("[object Object]");
  expect(error.name).toBe("user_feedback");
});
