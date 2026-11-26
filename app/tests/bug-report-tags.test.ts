import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { it, mock } from "node:test";

// A provider card's report pill sends the SDK's triage tags (model, status,
// request id) on both paths: the intake payload carries them as `tags` and as
// one plain line after the error (the issue body prints it), and the Sentry
// fallback carries them as TAGS, never in its message.
const intakePayloads: { error: string; tags?: Record<string, string> }[] = [];
let intakeRefuses = true;
const feedback: { message: string; tags: Record<string, string> }[] = [];

mock.module("@sentry/browser", {
  namedExports: {
    isInitialized: () => true,
    captureFeedback: (f: { message: string; tags: Record<string, string> }) => {
      feedback.push(f);
      return "event-1";
    },
  },
});
mock.module(new URL("../src/lib/sentry-delivery.ts", import.meta.url).href, {
  namedExports: { confirmDelivery: async (id: string) => id },
});
mock.module(new URL("../src/lib/os-bridge.ts", import.meta.url).href, {
  namedExports: {
    osReadRecentLogs: async () => ({ backend: "", frontend: "" }),
    osReportBug: async (payload: { error: string }) => {
      intakePayloads.push(payload);
      if (!intakeRefuses) return "BUG-1";
      throw Object.assign(new Error("usage limit exceeded"), {
        kind: "intake_unavailable",
      });
    },
  },
});
mock.module(new URL("../src/lib/error-report.ts", import.meta.url).href, {
  namedExports: { reportError: () => {}, logAndReportError: () => {} },
});
mock.module(new URL("../src/lib/quiet-error-report.ts", import.meta.url).href, {
  namedExports: { reportQuietError: () => {} },
});

const { submitBugReport } = await import("../src/lib/bug-report.ts");

const TAGS = {
  provider_id: "openai-codex",
  provider_model: "gpt-6-luna",
  provider_http_status: "400",
  provider_request_id: "oai-req-1",
};
const LINE =
  "provider openai-codex · model gpt-6-luna · status 400 · request id oai-req-1";

it("a provider card's facts reach the intake issue as tags and one line", async () => {
  intakeRefuses = false;
  intakePayloads.length = 0;
  const outcome = await submitBugReport({
    command: "provider_error:unknown:openai-codex",
    error: '{"detail":"Bad Request"}',
    timestamp: "2026-11-15T00:00:00.000Z",
    appVersion: "1.0.0",
    tags: TAGS,
  });
  intakeRefuses = true;
  deepStrictEqual(outcome, { delivered: "linear", issueId: "BUG-1" });
  strictEqual(intakePayloads[0]?.error, `{"detail":"Bad Request"}\n\n${LINE}`);
  deepStrictEqual(intakePayloads[0]?.tags, TAGS);
});

it("a report without tags keeps its error as typed", async () => {
  intakeRefuses = false;
  intakePayloads.length = 0;
  await submitBugReport({
    command: "manual_report",
    error: "it froze",
    timestamp: "2026-11-15T00:00:00.000Z",
    appVersion: "1.0.0",
  });
  intakeRefuses = true;
  strictEqual(intakePayloads[0]?.error, "it froze");
  ok(!("tags" in (intakePayloads[0] as object)));
});

it("a provider card's facts ride the fallback feedback as tags", async () => {
  const warn = mock.method(console, "warn", () => {});
  const outcome = await submitBugReport({
    command: "provider_error:unknown:openai-codex",
    error: '{"detail":"Bad Request"}',
    timestamp: "2026-11-15T00:00:00.000Z",
    appVersion: "1.0.0",
    tags: TAGS,
  });
  warn.mock.restore();
  deepStrictEqual(outcome, { delivered: "fallback", eventId: "event-1" });
  strictEqual(feedback.length, 1);
  deepStrictEqual(feedback[0]?.tags, {
    provider_id: "openai-codex",
    provider_model: "gpt-6-luna",
    provider_http_status: "400",
    provider_request_id: "oai-req-1",
    source: "provider_error:unknown:openai-codex",
    bug_report_fallback: "intake_unavailable",
  });
  strictEqual(feedback[0]?.message, '{"detail":"Bad Request"}');
});
