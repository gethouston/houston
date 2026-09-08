import type {
  createSdkMcpServer as CreateSdkMcpServer,
  McpSdkServerConfigWithInstance,
} from "@anthropic-ai/claude-agent-sdk";
import { adaptTool } from "./mcp-tool-adapter";
import { type BridgedToolSetInput, buildBridgedToolSet } from "./mcp-tool-set";

// The bridged tool shape lives with the adapter that consumes it; re-exported
// so callers keep one import site for the Claude custom-tool bridge.
export type { BridgedPiTool } from "./mcp-tool-adapter";

/**
 * Bridge Houston's pi-shaped custom tools (`ask_user`, `plan_ready`,
 * `suggest_reusable`, `request_connection`, `integration_search`, `integration_execute`) onto the Claude Agent SDK's
 * in-process MCP transport (`createSdkMcpServer`), so the `anthropic` backend —
 * a `claude` subprocess that only sees SDK built-ins — can call the SAME tools
 * the pi backend exposes.
 *
 * WHY this exists: the shared system prompt MANDATES `ask_user` for every
 * blocking question and `request_connection` for every connect hand-off. On the
 * pi path those tools reach the model directly; on the Claude path they did not,
 * so an anthropic-backed agent was told to use tools it lacked. This closes that
 * gap WITHOUT forking any tool logic: the SAME `makeAskUserTool` /
 * `makeIntegrationTools` implementations are reused verbatim — this module only
 * ADAPTS each tool's shape (name, description, schema, execute) to the SDK's
 * `SdkMcpToolDefinition`.
 *
 * Because the handlers run IN THIS runtime process (not the subprocess),
 * the interaction record calls and the `/sandbox/integrations/*` proxy calls work
 * exactly as they do on the pi path: the SDK spawns its subprocess-stream reader
 * (which dispatches these handlers) synchronously inside `query()` — invoked
 * within `session.prompt()`, itself wrapped by exec-turn's
 * `runWithInteractionCapture` + `runWithActingContext` — so the per-turn
 * AsyncLocalStorage stores propagate into every handler. See `custom-tools.test`.
 */

/** The MCP server name. Tools surface to the model as `mcp__houston__<tool>`. */
export const HOUSTON_MCP_SERVER_NAME = "houston";

/** The public shape returned by {@link buildHoustonMcpServer}. */
export interface HoustonMcp {
  /** The in-process MCP server config, for the SDK's `mcpServers` option. */
  server: McpSdkServerConfigWithInstance;
  /**
   * The `mcp__houston__<tool>` names to auto-allow (SDK `allowedTools`), so the
   * subprocess runs them without a permission prompt — there is no human at the
   * runtime to approve, and these tools are not path-scoped (nothing for the
   * workspace guard to clamp), so pre-approval is safe and matches pi auto-run.
   */
  allowedTools: string[];
}

/** Inputs for {@link buildHoustonMcpServer}. */
export interface HoustonMcpInput extends BridgedToolSetInput {
  /** The SDK factory, passed in so this module never imports the optional SDK. */
  createSdkMcpServer: typeof CreateSdkMcpServer;
}

/**
 * Build the single in-process MCP server exposing Houston's custom tools to the
 * Claude backend, plus the `allowedTools` entries that auto-approve them.
 */
export function buildHoustonMcpServer(input: HoustonMcpInput): HoustonMcp {
  const tools = buildBridgedToolSet(input).map(adaptTool);
  const server = input.createSdkMcpServer({
    name: HOUSTON_MCP_SERVER_NAME,
    tools,
  });
  const allowedTools = tools.map(
    (t) => `mcp__${HOUSTON_MCP_SERVER_NAME}__${t.name}`,
  );
  return { server, allowedTools };
}
