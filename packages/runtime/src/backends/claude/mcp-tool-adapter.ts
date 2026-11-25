import type { SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type {
  AgentToolResult,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { TSchema } from "typebox";
import { loggedToolCall } from "../../session/tool-call-log";
import {
  CAPPED_TOOLS,
  cappedResultText,
  RESULT_HEAD_CHARS,
} from "../../session/tool-results/cap";
import {
  type SpillTarget,
  spillToolResult,
} from "../../session/tool-results/spill";
import { reportsNotDone } from "../../session/tools/assistant-result";
import { startedMissionFromDetails } from "../../session/tools/start-mission-receipt";
import { toZodShape } from "./schema-to-zod";

export interface BridgedPiTool {
  name: string;
  description: string;
  parameters: TSchema;
  execute(
    toolCallId: string,
    params: unknown,
    signal: AbortSignal | undefined,
    onUpdate: undefined,
    ctx: ExtensionContext,
  ): Promise<AgentToolResult<unknown>>;
}

const NOOP_CTX = {} as ExtensionContext;

// WHY: The CLI saves results over ~50k chars under its config dir, which the model cannot read. ADR-0009
export function adaptTool(
  tool: BridgedPiTool,
  spill?: SpillTarget,
): SdkMcpToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: toZodShape(tool.parameters),
    async handler(args: unknown, extra: unknown) {
      const signal = (extra as { signal?: AbortSignal } | undefined)?.signal;
      const result = await loggedToolCall(tool.name, () =>
        tool.execute(`mcp-${tool.name}`, args, signal, undefined, NOOP_CTX),
      );
      return toCallToolResult(
        spill ? capped(result, tool.name, spill) : result,
        tool.name,
      );
    },
  };
}

function capped(
  result: AgentToolResult<unknown>,
  toolName: string,
  spill: SpillTarget,
): AgentToolResult<unknown> {
  if (!CAPPED_TOOLS.has(toolName)) return result;
  const text = result.content
    .map((c) => (c.type === "text" ? c.text : ""))
    .filter(Boolean)
    .join("\n");
  if (text.length <= RESULT_HEAD_CHARS) return result;
  let path: string;
  try {
    path = spillToolResult(spill, toolName, text);
  } catch (err) {
    console.error(
      `[tool-results] could not save the ${toolName} result; sending it whole:`,
      err,
    );
    return result;
  }
  return {
    ...result,
    content: [
      { type: "text", text: cappedResultText(text, path) },
      ...result.content.filter((c) => c.type === "image"),
    ],
  };
}

type McpContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

function toCallToolResult(
  result: AgentToolResult<unknown>,
  toolName: string,
): {
  content: McpContent[];
  isError?: true;
  structuredContent?: { mission: { id: string; title: string; agent: string } };
} {
  const content = result.content.map(
    (c): McpContent =>
      c.type === "text"
        ? { type: "text", text: c.text }
        : { type: "image", data: c.data, mimeType: c.mimeType },
  );
  const details = result.details;
  if (reportsNotDone(details)) return { content, isError: true };
  const mission =
    toolName === "start_mission"
      ? startedMissionFromDetails(details)
      : undefined;
  if (mission) return { content, structuredContent: { mission } };
  return { content };
}
