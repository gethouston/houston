import type { SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type {
  AgentToolResult,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { TSchema } from "typebox";
import { loggedToolCall } from "../../session/tool-call-log";
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

/** Adapt one pi tool into an SDK in-process MCP tool definition. */
export function adaptTool(tool: BridgedPiTool): SdkMcpToolDefinition {
  return {
    name: tool.name,
    description: withPlainName(tool.name, tool.description),
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
      return toCallToolResult(result);
    },
  };
}

/**
 * Restate a tool's plain name inside its description. MCP tools surface to the
 * model as `mcp__houston__<tool>`, but the shared system prompt names them bare
 * (`ask_user`, `request_connection`). This sentence lets the model map the prompt
 * mandate onto the namespaced tool WITHOUT forking the shared prompt per backend.
 */
function withPlainName(name: string, description: string): string {
  return `This is the \`${name}\` tool (your instructions refer to it as \`${name}\`). ${description}`;
}

/** A single MCP text content block — the only shape Houston's tools emit. */
interface McpTextContent {
  type: "text";
  text: string;
}

/**
 * Map a pi tool result onto the MCP `CallToolResult` content shape. Every
 * bridged tool returns text; a non-text block (never produced today) is coerced
 * to a JSON string rather than dropped.
 */
function toCallToolResult(result: AgentToolResult<unknown>): {
  content: McpTextContent[];
} {
  const content = result.content.map(
    (c): McpTextContent =>
      c.type === "text"
        ? { type: "text", text: c.text }
        : { type: "text", text: JSON.stringify(c) },
  );
  return { content };
}
