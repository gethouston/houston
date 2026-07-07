import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Options } from "@anthropic-ai/claude-agent-sdk";
import { expect, test, vi } from "vitest";
import type { ToolSelection } from "../../session/tool-selection";
import type { ResolvedModel } from "../types";
import { createClaudeBackend } from "./backend";

/**
 * Verify the Claude backend WIRES the in-process MCP server into the SDK options:
 * the `mcpServers` map carries the `houston` server and `allowedTools` auto-allows
 * every `mcp__houston__*` tool. The SDK module is mocked so `query()` captures the
 * per-turn `Options` and `createSdkMcpServer` records the tool defs it was handed —
 * no subprocess, no binary.
 */

const h = vi.hoisted(() => ({
  capturedOptions: undefined as Options | undefined,
  capturedMcp: undefined as
    | { name: string; tools: { name: string }[] }
    | undefined,
}));

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: (params: { options: Options }) => {
    h.capturedOptions = params.options;
    return {
      [Symbol.asyncIterator]: () => ({
        next: async () => ({ done: true, value: undefined }),
      }),
    };
  },
  createSdkMcpServer: (opts: { name: string; tools: { name: string }[] }) => {
    h.capturedMcp = opts;
    return { type: "sdk", name: opts.name, instance: {} };
  },
}));

const toolSelection: ToolSelection = { toolNames: [], includeRunCode: false };
const model: ResolvedModel = {
  provider: "anthropic",
  id: "claude-sonnet-4-6",
  contextWindow: 200_000,
};

async function runTurn(
  integrations?: {
    baseUrl: string;
    sandboxToken: string;
  },
  mode?: "execute" | "plan",
): Promise<Options> {
  h.capturedOptions = undefined;
  h.capturedMcp = undefined;
  const root = mkdtempSync(join(tmpdir(), "houston-mcp-test-"));
  const backend = createClaudeBackend({
    workspaceDir: root,
    dataDir: join(root, "data"),
    readToken: () => undefined,
    toolSelection,
    systemPrompt: "system",
    integrations,
  });
  const session = await backend.createSession({
    conversationId: "c1",
    model,
    ...(mode ? { mode } : {}),
  });
  await session.prompt("hi");
  const options = h.capturedOptions;
  if (!options) throw new Error("query was not called");
  return options;
}

test("backend options carry the houston MCP server and its allowlist", async () => {
  const options = await runTurn({
    baseUrl: "http://host.local",
    sandboxToken: "tok",
  });
  expect(options.mcpServers?.houston).toBeDefined();
  expect(h.capturedMcp?.name).toBe("houston");
  expect(options.allowedTools).toContain("mcp__houston__ask_user");
  expect(options.allowedTools).toContain("mcp__houston__request_connection");
  expect(options.allowedTools).toContain("mcp__houston__integration_search");
  expect(options.allowedTools).toContain("mcp__houston__integration_execute");
});

test("without the integrations gate only ask_user is allow-listed", async () => {
  const options = await runTurn(undefined);
  expect(options.mcpServers?.houston).toBeDefined();
  expect(options.allowedTools).toEqual(["mcp__houston__ask_user"]);
});

test("AskUserQuestion stays disabled — Houston ships its own ask_user", async () => {
  const options = await runTurn(undefined);
  expect(options.disallowedTools).toContain("AskUserQuestion");
});

test("plan mode builds the MCP server WITHOUT integrations — only ask_user", async () => {
  // Even with the integrations gate present, plan mode withholds the integration
  // tools (they act on the user's connected apps), leaving just ask_user.
  const options = await runTurn(
    { baseUrl: "http://host.local", sandboxToken: "tok" },
    "plan",
  );
  expect(options.mcpServers?.houston).toBeDefined();
  expect(options.allowedTools).toEqual(["mcp__houston__ask_user"]);
  expect(h.capturedMcp?.tools.map((t) => t.name)).toEqual(["ask_user"]);
  // And the built-ins are the read-only plan subset.
  expect(options.tools).toEqual(["Read", "Glob", "Grep"]);
});
