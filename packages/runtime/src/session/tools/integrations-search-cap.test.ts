import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { adaptTool } from "../../backends/claude/mcp-tool-adapter";
import { makeToolResultContext } from "../../backends/pi/tool-result-context";
import { makeIntegrationTools } from "./integrations";
import type { ToolMatch } from "./integrations-render";

let workspaceDir: string;
beforeEach(() => {
  workspaceDir = mkdtempSync(join(tmpdir(), "search-cap-"));
});
afterEach(() => rmSync(workspaceDir, { recursive: true, force: true }));

// Six full-size schemas push the result past the 8k head both backends keep.
const gmailItems: ToolMatch[] = Array.from({ length: 6 }, (_, i) => ({
  action: `GMAIL_ACTION_${i}`,
  toolkit: "gmail",
  description: "Read emails",
  status: "connected",
  inputParams: {
    type: "object",
    properties: { query: { type: "string", description: "x".repeat(1600) } },
  },
  accounts: [{ id: "ca_work", label: "work@example.test" }, { id: "ca_home" }],
}));
const mixedItems: ToolMatch[] = [
  ...gmailItems,
  {
    action: "SLACK_SEND_MESSAGE",
    toolkit: "slack",
    description: "Send a message",
    status: "connectable",
  },
  {
    action: "NOTION_CREATE_PAGE",
    toolkit: "notion",
    description: "Create a page",
    status: "blocked",
  },
];
// Thirty actions whose signatures alone run past the 24 KB search ceiling.
const wideProperties = Object.fromEntries(
  Array.from({ length: 150 }, (_, i) => [`field_${i}`, { type: "string" }]),
);
const overCeilingItems: ToolMatch[] = Array.from({ length: 30 }, (_, i) => ({
  action: `SHEETS_ACTION_${i}`,
  toolkit: "googlesheets",
  description: "Update a sheet",
  status: "connected",
  inputParams: { type: "object", properties: wideProperties },
}));
const params = { query: "read emails", app: "gmail" };

const textOf = (content: { type: string; text?: string }[]) =>
  content.map((c) => c.text ?? "").join("\n");

function searchFor(items: ToolMatch[]) {
  const [search] = makeIntegrationTools({
    call: async () => Response.json({ items }),
  });
  if (!search) throw new Error("integration_search missing");
  return search;
}

async function claudeSees(items: ToolMatch[]): Promise<string> {
  const result = await adaptTool(searchFor(items), {
    workspaceDir,
    conversationId: "claude",
  }).handler(params, {});
  return textOf(result.content);
}

async function piSees(items: ToolMatch[]): Promise<string> {
  const raw = await searchFor(items).execute(
    "s1",
    params as never,
    undefined,
    undefined,
    {} as never,
  );
  const sent = await makeToolResultContext({
    workspaceDir,
    conversationId: "pi",
  })([
    {
      role: "assistant",
      content: [
        {
          type: "toolCall",
          id: "s1",
          name: "integration_search",
          arguments: {},
        },
      ],
    },
    {
      role: "toolResult",
      toolCallId: "s1",
      toolName: "integration_search",
      content: raw.content,
      isError: false,
      timestamp: 0,
    },
  ] as Parameters<ReturnType<typeof makeToolResultContext>>[0]);
  const result = sent[1] as { content: { type: string; text?: string }[] };
  return textOf(result.content);
}

function expectEveryRule(text: string) {
  expect(text).toContain("This result is");
  expect(text).toContain(
    "- gmail: ca_work (work@example.test), ca_home (account 2)",
  );
  expect(text).toContain(
    "you MUST ask ONE ask_user question before acting, even for read-only actions",
  );
  expect(text).toContain(
    "These apps exist but are not connected yet (slack). To let the user connect an app, call the request_connection tool",
  );
  expect(text).toContain(
    "These apps are turned off for this agent (notion). Tell the user they can be switched on in this agent's Settings, under Apps",
  );
}

const CUT_NOTE =
  "This list runs past the 24 KB search-result limit, so it is cut off before its end. Search again with a more specific query to see the actions that were cut off.";

test("a capped search keeps the accounts, connect and turned-off rules on Claude", async () => {
  expectEveryRule(await claudeSees(mixedItems));
});

test("a capped search keeps the accounts, connect and turned-off rules on pi", async () => {
  expectEveryRule(await piSees(mixedItems));
});

test("a search past the 24 KB ceiling says how to see what was cut, on both backends", async () => {
  expect(await claudeSees(overCeilingItems)).toContain(CUT_NOTE);
  expect(await piSees(overCeilingItems)).toContain(CUT_NOTE);
});
