import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  osReportBug: vi.fn(),
  osReadRecentLogs: vi.fn(async () => ({
    backend: "b-log",
    frontend: "f-log",
  })),
  captureBugReportFeedback: vi.fn(async () => "feedback-event"),
  reportQuietError: vi.fn(),
  logAndReportError: vi.fn(),
}));

vi.mock("@houston/app/lib/os-bridge", () => ({
  osReportBug: mocks.osReportBug,
  osReadRecentLogs: mocks.osReadRecentLogs,
}));
vi.mock("@houston/app/lib/sentry-feedback", () => ({
  captureBugReportFeedback: mocks.captureBugReportFeedback,
}));
vi.mock("@houston/app/lib/quiet-error-report", () => ({
  reportQuietError: mocks.reportQuietError,
}));
vi.mock("@houston/app/lib/error-report", () => ({
  logAndReportError: mocks.logAndReportError,
}));

import { submitBugReport } from "@houston/app/lib/bug-report";
import { BugReportError } from "@houston/app/lib/bug-report-failure";

const report = {
  command: "manual_report",
  error: "(no error)",
  userMessage: "message limit reached, where do I add my coupon?",
  userEmail: "person@example.com",
  workspaceName: "Acme",
  timestamp: "2026-10-09T05:49:00.000Z",
  appVersion: "1.0.6",
};

const usageLimit = new BugReportError({
  kind: "intake_unavailable",
  message: "Linear API returned GraphQL errors: usage limit exceeded",
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.captureBugReportFeedback.mockResolvedValue("feedback-event");
});

test("Linear taking the report is the whole story", async () => {
  mocks.osReportBug.mockResolvedValue("PRODUCT-2032");

  expect(await submitBugReport(report)).toEqual({
    delivered: "linear",
    issueId: "PRODUCT-2032",
  });
  expect(mocks.osReportBug).toHaveBeenCalledWith({
    ...report,
    logs: { backend: "b-log", frontend: "f-log" },
  });
  expect(mocks.captureBugReportFeedback).not.toHaveBeenCalled();
});

test("the usage limit delivers the person's words as feedback, quietly", async () => {
  mocks.osReportBug.mockRejectedValue(usageLimit);
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

  expect(await submitBugReport(report)).toEqual({
    delivered: "fallback",
    eventId: "feedback-event",
  });
  expect(mocks.captureBugReportFeedback).toHaveBeenCalledWith(
    expect.objectContaining({
      message: report.userMessage,
      email: report.userEmail,
      command: "manual_report",
      reason: "intake_unavailable",
      logs: { backend: "b-log", frontend: "f-log" },
    }),
  );
  expect(mocks.reportQuietError).toHaveBeenCalledWith(
    "bug_intake_unavailable",
    "manual_report",
    "Linear API returned GraphQL errors: usage limit exceeded",
    usageLimit,
  );
  expect(mocks.logAndReportError).not.toHaveBeenCalled();
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining("bug intake unavailable"),
  );
  warn.mockRestore();
});

test("a card's report (no typed words) sends its diagnostic as the message", async () => {
  mocks.osReportBug.mockRejectedValue(usageLimit);
  vi.spyOn(console, "warn").mockImplementation(() => {});

  await submitBugReport({
    command: "report_bug",
    error: "provider said no",
    timestamp: report.timestamp,
    appVersion: report.appVersion,
  });
  expect(mocks.captureBugReportFeedback).toHaveBeenCalledWith(
    expect.objectContaining({ message: "provider said no" }),
  );
});

test("any other refusal still delivers, and reports as a real error", async () => {
  const broken = new BugReportError({
    kind: "other",
    message: "Linear bug label not found: User Bug",
  });
  mocks.osReportBug.mockRejectedValue(broken);

  expect((await submitBugReport(report)).delivered).toBe("fallback");
  expect(mocks.logAndReportError).toHaveBeenCalledWith("manual_report", broken);
  expect(mocks.reportQuietError).not.toHaveBeenCalled();
});

test("every channel failing answers none, so the surface keeps the text", async () => {
  mocks.osReportBug.mockRejectedValue(usageLimit);
  mocks.captureBugReportFeedback.mockResolvedValue("");
  vi.spyOn(console, "warn").mockImplementation(() => {});

  expect(await submitBugReport(report)).toEqual({ delivered: "none" });
});
