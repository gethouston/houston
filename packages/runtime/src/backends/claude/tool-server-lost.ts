import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { HOUSTON_MCP_SERVER_NAME } from "./custom-tools";

/**
 * Whether an SDK message proves this turn is running WITHOUT Houston's tools
 * (PRODUCT-1706).
 *
 * Seen live on a scheduled routine, twice, with one signature: the SDK resumed
 * a session whose previous turn had left a background shell running, injected
 * its own "no completion record for that task" notification ahead of our
 * prompt, and then served the turn with the in-process `houston` MCP server
 * detached. The runtime had registered the server (its own allowedTools
 * warning listed every Houston tool), the model's first call answered "No such
 * tool available: mcp__houston__integration_execute", and the permission
 * stream closed on the next Bash. The model did the only thing it could and
 * reported that the integrations were "missing" — a routine that needs GitHub
 * and Slack skipped its work and nothing surfaced as a failure.
 *
 * Two signals, both cheap to read on the stream:
 *  - the `init` system message lists every MCP server with its status; a
 *    missing or non-`connected` `houston` entry means no Houston tool will
 *    answer this turn;
 *  - a tool_result whose error names a `mcp__houston__*` tool as unavailable,
 *    for an SDK that reports `connected` yet never routes the call.
 *
 * The session treats either as a lost resume: abandon the attempt, drop the
 * SDK session mapping, and rerun the prompt as a fresh session carrying the
 * canonical history — the same path a rejected resume already takes.
 */

const MISSING_HOUSTON_TOOL = /No such tool available:\s*mcp__houston__/;

export function houstonToolServerLost(msg: SDKMessage): boolean {
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
    return toolResultTexts(content).some((text) =>
      MISSING_HOUSTON_TOOL.test(text),
    );
  }
  return false;
}

/** The text of every error tool_result block in a user message's content. */
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
