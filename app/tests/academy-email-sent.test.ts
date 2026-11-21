import { strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { FeedItem } from "@houston-ai/chat";
import type { AcademyRecord } from "../src/lib/academy/academy-record.ts";
import { emailSentVia } from "../src/lib/academy/email-lesson/email-sent.ts";
import { firstEmailCounts } from "../src/lib/academy/email-lesson/first-email.ts";

const call = (action: unknown, name = "integration_execute"): FeedItem => ({
  feed_type: "tool_call",
  data: { name, input: action === null ? null : { action, params: {} } },
});
const SENT = '{\n  "id": "18f2c9a0b1",\n  "labelIds": ["SENT"]\n}';
const result = (isError = false, content = SENT): FeedItem => ({
  feed_type: "tool_result",
  data: { content, is_error: isError },
});
const said = (text: string): FeedItem => ({
  feed_type: "assistant_text",
  data: text,
});

describe("emailSentVia", () => {
  it("reads a successful Gmail or Outlook send, naming the app", () => {
    strictEqual(emailSentVia([call("GMAIL_SEND_EMAIL"), result()]), "gmail");
    strictEqual(
      emailSentVia([call("OUTLOOK_OUTLOOK_SEND_EMAIL"), result()]),
      "outlook",
    );
    strictEqual(emailSentVia([call("gmail_send_draft"), result()]), "gmail");
  });

  it("waits while the send has not answered", () => {
    strictEqual(emailSentVia([call("GMAIL_SEND_EMAIL")]), null);
  });

  it("never counts a send that errored", () => {
    strictEqual(
      emailSentVia([call("GMAIL_SEND_EMAIL"), result(true, "boom")]),
      null,
    );
  });

  it("never counts an action that only reads", () => {
    strictEqual(emailSentVia([call("GMAIL_GET_PROFILE"), result()]), null);
    strictEqual(emailSentVia([call("GMAIL_FETCH_EMAILS"), result()]), null);
  });

  it("never counts another tool, or the AI Employee's own words", () => {
    strictEqual(
      emailSentVia([call("GMAIL_SEND_EMAIL", "integration_search"), result()]),
      null,
    );
    strictEqual(emailSentVia([said("Sent it! GMAIL_SEND_EMAIL")]), null);
  });

  it("reads the send under the Claude backend's MCP-prefixed tool name", () => {
    strictEqual(
      emailSentVia([
        call("GMAIL_SEND_EMAIL", "mcp__houston__integration_execute"),
        result(),
      ]),
      "gmail",
    );
  });

  it("counts the app's bare acknowledgement as sent", () => {
    strictEqual(
      emailSentVia([call("OUTLOOK_SEND_EMAIL"), result(false, "Done.")]),
      "outlook",
    );
  });

  it("never counts guidance returned when nothing was sent", () => {
    for (const guidance of [
      "This action's app is turned off for this agent, so it can't run.",
      'The action slug "GMAIL_SEND_EMAIL" does not exist in the app catalog.',
    ])
      strictEqual(
        emailSentVia([call("GMAIL_SEND_EMAIL"), result(false, guidance)]),
        null,
      );
  });

  it("pairs each result with its own call", () => {
    strictEqual(
      emailSentVia([
        call("GMAIL_GET_PROFILE"),
        result(),
        call("GMAIL_SEND_EMAIL"),
      ]),
      null,
    );
    strictEqual(
      emailSentVia([
        call("GMAIL_SEND_EMAIL"),
        result(true, "bad recipient"),
        call("GMAIL_SEND_EMAIL"),
        result(),
      ]),
      "gmail",
    );
  });

  it("completes a call streamed as a placeholder with its twin", () => {
    strictEqual(
      emailSentVia([call(null), call("OUTLOOK_SEND_EMAIL"), result()]),
      "outlook",
    );
  });
});

describe("the first-email event", () => {
  const record = (lessons: AcademyRecord["lessons"]): AcademyRecord => ({
    version: 1,
    chapters: {},
    lessons,
    lessonPositions: {},
    usageByDevice: {},
    usageDay: null,
    usageToday: 0,
    streak: { current: 0, best: 0, lastActiveDay: null },
    updatedAt: "2026-08-01T10:00:00.000Z",
  });

  const read = (record: AcademyRecord | null) => ({ record, isError: false });

  it("counts only while the lesson is unfinished, never on a replay", () => {
    strictEqual(firstEmailCounts(read(null), "employee-email"), true);
    strictEqual(firstEmailCounts(read(record({})), "employee-email"), true);
    const done = record({
      "employee-email": {
        completedAt: "2026-08-02T10:00:00.000Z",
        experience: 25,
      },
    });
    strictEqual(firstEmailCounts(read(done), "employee-email"), false);
  });

  it("never counts when the record could not be read", () => {
    strictEqual(
      firstEmailCounts({ record: null, isError: true }, "employee-email"),
      false,
    );
  });
});
