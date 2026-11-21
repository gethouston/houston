import type { createSdkMcpServer as CreateSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { afterEach, expect, test } from "vitest";
import { buildClaudeEnv } from "./claude-env";
import { buildHoustonMcpServer } from "./custom-tools";
import { adaptTool, type BridgedPiTool } from "./mcp-tool-adapter";
import { buildBridgedToolSet } from "./mcp-tool-set";

const browser = { workspaceDir: "/ws/Agent", liveView: true };
const names = (tools: BridgedPiTool[]) => tools.map((t) => t.name);

function bridgedActions(liveView: boolean): unknown[] {
  const tool = buildBridgedToolSet({
    browser: { workspaceDir: "/ws/Agent", liveView },
  }).find((t) => t.name === "browser");
  const schema = tool?.parameters as {
    properties: { action: { anyOf: { const: unknown }[] } };
  };
  const offered = schema.properties.action.anyOf.map((option) => option.const);
  return ["open", "close", "handoff"].filter((name) => offered.includes(name));
}

const savedTimeout = process.env.MCP_TOOL_TIMEOUT;
afterEach(() => {
  if (savedTimeout === undefined) delete process.env.MCP_TOOL_TIMEOUT;
  else process.env.MCP_TOOL_TIMEOUT = savedTimeout;
});

test("the long-lived Claude path bridges the browser for execute and auto", () => {
  for (const mode of [undefined, "execute", "auto"] as const)
    expect(names(buildBridgedToolSet({ browser, mode }))).toContain("browser");
});

test("plan and the coordinator never get the browser on the Claude path", () => {
  expect(names(buildBridgedToolSet({ browser, mode: "plan" }))).not.toContain(
    "browser",
  );
  expect(
    names(buildBridgedToolSet({ browser, personalAssistant: true })),
  ).not.toContain("browser");
  expect(names(buildBridgedToolSet({}))).not.toContain("browser");
});

test("the bridged schema offers handoff only where the live view is served", () => {
  expect(bridgedActions(true)).toEqual(["open", "close", "handoff"]);
  expect(bridgedActions(false)).toEqual(["open", "close"]);
});

test("nothing cuts a hand-off's 10-minute tool call short on the Claude path", () => {
  let options: Record<string, unknown> = {};
  const fakeCreate = ((opts: Record<string, unknown>) => {
    options = opts;
    return { type: "sdk", name: "houston", instance: {} };
  }) as unknown as typeof CreateSdkMcpServer;
  buildHoustonMcpServer({ createSdkMcpServer: fakeCreate, browser });
  expect(Object.keys(options).sort()).toEqual(["name", "tools"]);

  process.env.MCP_TOOL_TIMEOUT = "60000";
  expect(
    buildClaudeEnv(undefined, { configDir: "/config" }).MCP_TOOL_TIMEOUT,
  ).toBeUndefined();
});

test("a screenshot reaches Claude as an image, not a JSON string", async () => {
  const tool: BridgedPiTool = {
    name: "browser",
    description: "d",
    parameters: buildBridgedToolSet({ browser }).find(
      (t) => t.name === "browser",
    )?.parameters as BridgedPiTool["parameters"],
    execute: async () => ({
      content: [
        { type: "text", text: "Screenshot." },
        { type: "image", data: "AAAA", mimeType: "image/jpeg" },
      ],
      details: { ok: true },
    }),
  };
  const result = await adaptTool(tool).handler({ action: "screenshot" }, {});
  expect(result.content).toEqual([
    { type: "text", text: "Screenshot." },
    { type: "image", data: "AAAA", mimeType: "image/jpeg" },
  ]);
});
