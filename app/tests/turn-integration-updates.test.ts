import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  externalUrlOf,
  synthesizedUrl,
} from "../src/lib/integration-artifact-url.ts";
import {
  integrationUpdatesOf,
  isExternalWriteAction,
} from "../src/lib/turn-integration-updates.ts";
import {
  buildTurnSummaryItems,
  groupTurnSummaryItems,
} from "../src/lib/turn-summary-items.ts";

const ok = (content: string) => ({ content, is_error: false });

describe("isExternalWriteAction", () => {
  it("accepts mutation slugs", () => {
    strictEqual(isExternalWriteAction("GMAIL_SEND_EMAIL"), true);
    strictEqual(isExternalWriteAction("GOOGLESHEETS_BATCH_UPDATE"), true);
    strictEqual(isExternalWriteAction("AIRTABLE_CREATE_RECORD"), true);
    strictEqual(isExternalWriteAction("NOTION_ADD_PAGE_CONTENT"), true);
  });

  it("rejects read slugs", () => {
    strictEqual(isExternalWriteAction("GMAIL_FETCH_EMAILS"), false);
    strictEqual(isExternalWriteAction("GOOGLESHEETS_GET_SPREADSHEET"), false);
    strictEqual(isExternalWriteAction("SLACK_LIST_CHANNELS"), false);
    strictEqual(isExternalWriteAction("LINEAR_SEARCH_ISSUES"), false);
  });

  it("does not confuse app names containing verb-like words", () => {
    strictEqual(isExternalWriteAction("SENDGRID_GET_STATS"), false);
  });

  it("reads a custom executor address by its tool name", () => {
    strictEqual(
      isExternalWriteAction("tools.acme-crm.owner.conn.jobs.createJob"),
      true,
    );
    strictEqual(
      isExternalWriteAction("tools.acme-crm.owner.conn.jobs.listJobs"),
      false,
    );
  });
});

describe("externalUrlOf", () => {
  it("prefers canonical artifact keys over generic url keys", () => {
    const url = externalUrlOf(
      JSON.stringify({
        selfLink: "https://example.com/generic",
        file: { webViewLink: "https://docs.google.com/document/d/abc/edit" },
      }),
    );
    strictEqual(url, "https://docs.google.com/document/d/abc/edit");
  });

  it("skips API hosts and brand art", () => {
    const url = externalUrlOf(
      JSON.stringify({
        url: "https://api.airtable.com/v0/app123",
        iconUrl: "https://cdn.example.com/icon.png",
        record_url: "https://airtable.com/app123/tbl456/rec789",
      }),
    );
    strictEqual(url, "https://airtable.com/app123/tbl456/rec789");
  });

  it("returns undefined when nothing artifact-like exists", () => {
    strictEqual(
      externalUrlOf(JSON.stringify({ id: "19x", threadId: "19x" })),
      undefined,
    );
  });

  it("falls back to a raw-text scan on truncated JSON", () => {
    const truncated = `{
  "permalink": "https://myworkspace.slack.com/archives/C1/p2",
  "blob": "AAAA[result truncated: it exceeded the 256 KB tool-result limit`;
    strictEqual(
      externalUrlOf(truncated),
      "https://myworkspace.slack.com/archives/C1/p2",
    );
  });
});

describe("synthesizedUrl", () => {
  it("builds the spreadsheet URL from the action params", () => {
    strictEqual(
      synthesizedUrl("GOOGLESHEETS_BATCH_UPDATE", { spreadsheet_id: "S1" }, {}),
      "https://docs.google.com/spreadsheets/d/S1",
    );
  });

  it("builds the Gmail thread URL from the response data", () => {
    strictEqual(
      synthesizedUrl("GMAIL_SEND_EMAIL", {}, { id: "m1", threadId: "t1" }),
      "https://mail.google.com/mail/u/0/#all/t1",
    );
    strictEqual(
      synthesizedUrl(
        "GMAIL_SEND_EMAIL",
        {},
        { response_data: { id: "m1", threadId: "t1" } },
      ),
      "https://mail.google.com/mail/u/0/#all/t1",
    );
  });

  it("builds the Airtable table URL from base + table params", () => {
    strictEqual(
      synthesizedUrl(
        "AIRTABLE_UPDATE_RECORD",
        { base_id: "app1", table_id_or_name: "tbl1" },
        {},
      ),
      "https://airtable.com/app1/tbl1",
    );
  });

  it("knows nothing about other apps", () => {
    strictEqual(
      synthesizedUrl("SLACK_SEND_MESSAGE", { channel: "C1" }, {}),
      undefined,
    );
  });
});

describe("integrationUpdatesOf", () => {
  it("keeps successful writes, drops reads, errors, and guidance texts", () => {
    const updates = integrationUpdatesOf([
      {
        name: "mcp__houston__integration_execute",
        input: { action: "GMAIL_SEND_EMAIL", params: {} },
        result: ok(JSON.stringify({ id: "m1", threadId: "t1" })),
      },
      {
        name: "integration_execute",
        input: { action: "GMAIL_FETCH_EMAILS", params: {} },
        result: ok(JSON.stringify({ messages: [] })),
      },
      {
        name: "integration_execute",
        input: { action: "SLACK_SEND_MESSAGE", params: {} },
        result: { content: "boom", is_error: true },
      },
      {
        name: "integration_execute",
        input: { action: "NOTION_CREATE_PAGE", params: {} },
        result: ok("This action's app is turned off for this agent, so..."),
      },
      {
        name: "Write",
        input: { file_path: "/tmp/a.md" },
        result: ok("ok"),
      },
    ]);
    deepStrictEqual(updates, [
      {
        kind: "integration",
        action: "GMAIL_SEND_EMAIL",
        url: "https://mail.google.com/mail/u/0/#all/t1",
      },
    ]);
  });

  it("collapses identical repeats but keeps distinct artifacts", () => {
    const send = (thread: string) => ({
      name: "integration_execute",
      input: { action: "GMAIL_SEND_EMAIL", params: {} },
      result: ok(JSON.stringify({ threadId: thread })),
    });
    const updates = integrationUpdatesOf([send("t1"), send("t1"), send("t2")]);
    strictEqual(updates.length, 2);
    strictEqual(updates[0].url?.endsWith("t1"), true);
    strictEqual(updates[1].url?.endsWith("t2"), true);
  });

  it("accepts a bare Done. result with no payload", () => {
    const updates = integrationUpdatesOf([
      {
        name: "integration_execute",
        input: { action: "TRELLO_MOVE_CARD", params: {} },
        result: ok("Done."),
      },
    ]);
    deepStrictEqual(updates, [
      { kind: "integration", action: "TRELLO_MOVE_CARD" },
    ]);
  });
});

describe("turn summary grouping", () => {
  it("puts integration rows first in Updates made", () => {
    const items = buildTurnSummaryItems(
      [
        {
          name: "integration_execute",
          input: {
            action: "GOOGLESHEETS_BATCH_UPDATE",
            params: { spreadsheet_id: "S1" },
          },
          result: ok(JSON.stringify({ spreadsheetId: "S1" })),
        },
        {
          name: "Edit",
          input: { file_path: "Personal/Assistant/notes.md" },
          result: ok("ok"),
        },
      ],
      "Personal/Assistant",
    );
    const groups = groupTurnSummaryItems(items);
    strictEqual(groups.updates[0].kind, "integration");
    strictEqual(groups.updates.length, 2);
    strictEqual(groups.files.length, 0);
  });
});
