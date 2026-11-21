import { beforeEach, expect, test, vi } from "vitest";

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

  expect(body).toBe("shell:errorToast.genericDescription");
  expect(captureException).toHaveBeenCalledTimes(1);
  const [error, context] = captureException.mock.calls[0] as [
    Error,
    { source: string },
  ];
  expect(error.name).toBe("manual_report");
  expect(error.message).toBe("feedback failed (501)");
  expect(context.source).toBe("manual_report");
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
  const failure = new Error("Engine error 500");
  showErrorToast("create_workspace", failure.message, failure);
  await Promise.resolve();
  expect(captureException).toHaveBeenCalledTimes(1);

  const body = genericErrorDescription("create_workspace", failure);

  expect(body).toBe("shell:errorToast.genericDescription");
  expect(captureException).toHaveBeenCalledTimes(1);
});

test("a fresh error from a non-call() path still reports", () => {
  logAndReportError("copy_to_clipboard", new Error("write denied"));

  expect(captureException).toHaveBeenCalledTimes(1);
});

test("a non-Error rejection still reports a readable reason", () => {
  genericErrorDescription("user_feedback", { status: 501 });

  const [error] = captureException.mock.calls[0] as [Error];
  expect(error.message).toBe("object {status: 501} keys: status");
  expect(error.name).toBe("user_feedback");
});
