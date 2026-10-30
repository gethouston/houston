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

/**
 * The minimal slice of a pi tool this bridge reads. `execute`'s trailing
 * `onUpdate`/`ctx` params are inert for every Houston custom tool (verified:
 * none read them), so the adapter passes inert placeholders — see {@link NOOP_CTX}.
 * A pi `ToolDefinition<S>` narrows `params` to `Static<S>`; here it is widened to
 * `unknown` so heterogeneous tools share one adapter, and the SDK-validated args
 * are handed straight through.
 */
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

/**
 * Inert `ExtensionContext` placeholder. The bridged tools never touch `ctx`
 * (they use the turn-scoped AsyncLocalStorage stores instead), so an empty object
 * is safe. Cast once here rather than threading a real context the SDK path has
 * no way to supply.
 */
// SAFETY: every tool admitted to this bridge ignores ExtensionContext and gets
// its request scope from AsyncLocalStorage, as documented on BridgedPiTool.
const NOOP_CTX = {} as ExtensionContext;

/**
 * Adapt one pi tool into an SDK in-process MCP tool definition. With a
 * `spill` target, an oversized result from a capped tool reaches the model as
 * its head plus the path of the full result (session/tool-results/cap.ts).
 * The CLI only offloads results past ~50k characters, to a file under its
 * config dir that Houston's file guard keeps the model from reading.
 */
export function adaptTool(
  tool: BridgedPiTool,
  spill?: SpillTarget,
): SdkMcpToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: toZodShape(tool.parameters),
    async handler(args: unknown, extra: unknown) {
      // The SDK passes an abort signal on `extra`; forward it so a stopped turn
      // cancels the integration proxy fetch mid-flight (same as the pi path).
      const signal = (extra as { signal?: AbortSignal } | undefined)?.signal;
      // The SAME tool-call record the pi path writes (session/tool-call-log.ts),
      // so runtime.log reads identically whichever backend served the turn.
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
    // Unsaved, the result goes out whole: a bigger request, never a lost one.
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

/** The MCP content blocks Houston's tools emit: text, and `browser` screenshots. */
type McpContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

/** Map a pi tool result onto the MCP `CallToolResult` content shape. */
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
