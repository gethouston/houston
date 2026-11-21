import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { HOUSTON_MCP_SERVER_NAME } from "./custom-tools";

const MISSING_HOUSTON_TOOL = /No such tool available:\s*(mcp__houston__[\w-]+)/;

export function houstonToolServerLost(
  msg: SDKMessage,
  offered?: readonly string[],
): boolean {
  if (msg.type === "system" && msg.subtype === "init") {
    const servers = (msg as { mcp_servers?: unknown }).mcp_servers;
    if (!Array.isArray(servers)) return false;
    const houston = servers.find(
      (s): s is { name: string; status: string } =>
        typeof s === "object" &&
        s !== null &&
        (s as { name?: unknown }).name === HOUSTON_MCP_SERVER_NAME,
    );
    return houston === undefined || houston.status !== "connected";
  }
  if (msg.type === "user") {
    const content = (msg as { message?: { content?: unknown } }).message
      ?.content;
    return toolResultTexts(content).some((text) => {
      const tool = MISSING_HOUSTON_TOOL.exec(text)?.[1];
      return tool !== undefined && (!offered || offered.includes(tool));
    });
  }
  return false;
}

function toolResultTexts(content: unknown): string[] {
  if (!Array.isArray(content)) return [];
  const out: string[] = [];
  for (const block of content) {
    if (
      typeof block !== "object" ||
      block === null ||
      (block as { type?: unknown }).type !== "tool_result" ||
      (block as { is_error?: unknown }).is_error !== true
    ) {
      continue;
    }
    const inner = (block as { content?: unknown }).content;
    if (typeof inner === "string") out.push(inner);
    else if (Array.isArray(inner)) {
      for (const part of inner) {
        const text = (part as { text?: unknown })?.text;
        if (typeof text === "string") out.push(text);
      }
    }
  }
  return out;
}
