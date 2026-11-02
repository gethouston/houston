import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { adaptTool } from "../../backends/claude/mcp-tool-adapter";
import { makeToolResultContext } from "../../backends/pi/tool-result-context";
import { makeIntegrationTools } from "./integrations";

let workspaceDir: string;
beforeEach(() => {
  workspaceDir = mkdtempSync(join(tmpdir(), "search-cap-"));
});
afterEach(() => rmSync(workspaceDir, { recursive: true, force: true }));

// Six full-size schemas push the result past the 8k head both backends keep.
const items = Array.from({ length: 6 }, (_, i) => ({
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
const params = { query: "read emails", app: "gmail" };
const [search] = makeIntegrationTools({
  call: async () => Response.json({ items }),
});
if (!search) throw new Error("integration_search missing");

const textOf = (content: { type: string; text?: string }[]) =>
  content.map((c) => c.text ?? "").join("\n");

function expectAccountRules(text: string) {
  expect(text).toContain("This result is");
  expect(text).toContain(
    "- gmail: ca_work (work@example.test), ca_home (account 2)",
  );
  expect(text).toContain(
    "you MUST ask ONE ask_user question before acting, even for read-only actions",
  );
}

test("a capped multi-account search keeps the accounts and their rules on Claude", async () => {
  const result = await adaptTool(search, {
    workspaceDir,
    conversationId: "claude",
  }).handler(params, {});
  expectAccountRules(textOf(result.content));
});

test("a capped multi-account search keeps the accounts and their rules on pi", async () => {
  const raw = await search.execute(
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
  expectAccountRules(textOf(result.content));
});
