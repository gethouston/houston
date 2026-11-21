import type {
  createSdkMcpServer as CreateSdkMcpServer,
  McpSdkServerConfigWithInstance,
} from "@anthropic-ai/claude-agent-sdk";
import type { SpillTarget } from "../../session/tool-results/spill";
import { adaptTool } from "./mcp-tool-adapter";
import { type BridgedToolSetInput, buildBridgedToolSet } from "./mcp-tool-set";

export type { BridgedPiTool } from "./mcp-tool-adapter";

export const HOUSTON_MCP_SERVER_NAME = "houston";

export interface HoustonMcp {
  server: McpSdkServerConfigWithInstance;
  allowedTools: string[];
}

export interface HoustonMcpInput extends BridgedToolSetInput {
  createSdkMcpServer: typeof CreateSdkMcpServer;
  spill?: SpillTarget;
}

export function buildHoustonMcpServer(input: HoustonMcpInput): HoustonMcp {
  const tools = buildBridgedToolSet(input).map((tool) =>
    adaptTool(tool, input.spill),
  );
  const server = input.createSdkMcpServer({
    name: HOUSTON_MCP_SERVER_NAME,
    tools,
  });
  const allowedTools = tools.map(
    (t) => `mcp__${HOUSTON_MCP_SERVER_NAME}__${t.name}`,
  );
  return { server, allowedTools };
}
