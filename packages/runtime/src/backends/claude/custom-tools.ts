import type {
  createSdkMcpServer as CreateSdkMcpServer,
  McpSdkServerConfigWithInstance,
  SdkMcpToolDefinition,
} from "@anthropic-ai/claude-agent-sdk";
import type {
  AgentToolResult,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { TSchema } from "typebox";
import { z } from "zod";
import { makeAskUserTool } from "../../session/tools/ask-user";
import {
  type IntegrationToolOptions,
  makeIntegrationTools,
} from "../../session/tools/integrations";

/**
 * Bridge Houston's pi-shaped custom tools (`ask_user`, `request_connection`,
 * `integration_search`, `integration_execute`) onto the Claude Agent SDK's
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
export interface HoustonMcpInput {
  /** The SDK factory, passed in so this module never imports the optional SDK. */
  createSdkMcpServer: typeof CreateSdkMcpServer;
  /**
   * Integration proxy config when this runtime can reach its host with a sandbox
   * token — the SAME gate as the pi path (`config.controlPlaneUrl &&
   * config.sandboxToken`). Present → `request_connection` + `integration_search`
   * + `integration_execute` are exposed; absent → only `ask_user` is.
   */
  integrations?: IntegrationToolOptions;
}

/**
 * The minimal slice of a pi tool this bridge reads. `execute`'s trailing
 * `onUpdate`/`ctx` params are inert for all four Houston custom tools (verified:
 * none read them), so the adapter passes inert placeholders — see {@link NOOP_CTX}.
 * A pi `ToolDefinition<S>` narrows `params` to `Static<S>`; here it is widened to
 * `unknown` so heterogeneous tools share one adapter, and the SDK-validated args
 * are handed straight through.
 */
interface BridgedPiTool {
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
 * Inert `ExtensionContext` placeholder. The four bridged tools never touch `ctx`
 * (they use the turn-scoped AsyncLocalStorage stores instead), so an empty object
 * is safe. Cast once here rather than threading a real context the SDK path has
 * no way to supply.
 */
const NOOP_CTX = {} as ExtensionContext;

/**
 * Build the single in-process MCP server exposing Houston's custom tools to the
 * Claude backend, plus the `allowedTools` entries that auto-approve them.
 */
export function buildHoustonMcpServer(input: HoustonMcpInput): HoustonMcp {
  // Reuse the EXISTING tool implementations verbatim; gate the integration tools
  // exactly as the pi path does. The variance between a concrete pi
  // `ToolDefinition<S>` and the widened adapter shape is bridged by one
  // documented assertion at this single boundary.
  const piTools = [
    makeAskUserTool(),
    ...(input.integrations ? makeIntegrationTools(input.integrations) : []),
  ] as unknown as BridgedPiTool[];

  const tools = piTools.map(adaptTool);
  const server = input.createSdkMcpServer({
    name: HOUSTON_MCP_SERVER_NAME,
    tools,
  });
  const allowedTools = tools.map(
    (t) => `mcp__${HOUSTON_MCP_SERVER_NAME}__${t.name}`,
  );
  return { server, allowedTools };
}

/** Adapt one pi tool into an SDK in-process MCP tool definition. */
function adaptTool(tool: BridgedPiTool): SdkMcpToolDefinition {
  return {
    name: tool.name,
    description: withPlainName(tool.name, tool.description),
    inputSchema: toZodShape(tool.parameters),
    async handler(args: unknown, extra: unknown) {
      // The SDK passes an abort signal on `extra`; forward it so a stopped turn
      // cancels the integration proxy fetch mid-flight (same as the pi path).
      const signal = (extra as { signal?: AbortSignal } | undefined)?.signal;
      const result = await tool.execute(
        `mcp-${tool.name}`,
        args,
        signal,
        undefined,
        NOOP_CTX,
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
 * Map a pi tool result onto the MCP `CallToolResult` content shape. All four
 * bridged tools return text; a non-text block (never produced today) is coerced
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

// --- typebox (JSON Schema) → zod raw shape --------------------------------
//
// The SDK's in-process MCP requires each tool's `inputSchema` to be a zod raw
// shape (a record of zod validators); it rejects a plain JSON Schema. Houston's
// pi tools carry typebox schemas (which ARE JSON Schema), so the bridge converts
// each tool's typebox params into the equivalent zod raw shape at build time.
// This keeps the pi tool the SINGLE source of truth for the schema — no
// hand-maintained zod duplicate to drift. The converter covers exactly the
// JSON Schema constructs these tools use; an unrecognized node falls back to
// `z.unknown()` rather than silently dropping a field.

/** The JSON-Schema-shaped view of a typebox node the converter reads. */
interface JsonSchemaNode {
  type?: string;
  description?: string;
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  items?: JsonSchemaNode;
  patternProperties?: Record<string, JsonSchemaNode>;
}

/** Convert a typebox object schema into a zod raw shape (per-property validators). */
export function toZodShape(schema: TSchema): Record<string, z.ZodType> {
  const node = schema as unknown as JsonSchemaNode;
  const required = new Set(node.required ?? []);
  const shape: Record<string, z.ZodType> = {};
  for (const [key, prop] of Object.entries(node.properties ?? {})) {
    const built = toZodType(prop);
    shape[key] = required.has(key) ? built : built.optional();
  }
  return shape;
}

/** Convert one JSON Schema node into the equivalent zod validator. */
function toZodType(node: JsonSchemaNode): z.ZodType {
  const built = baseZodType(node);
  return node.description ? built.describe(node.description) : built;
}

function baseZodType(node: JsonSchemaNode): z.ZodType {
  switch (node.type) {
    case "string":
      return z.string();
    case "number":
      return z.number();
    case "integer":
      return z.number().int();
    case "boolean":
      return z.boolean();
    case "array":
      return z.array(node.items ? toZodType(node.items) : z.unknown());
    case "object": {
      if (node.properties) return z.object(toZodShape(node as TSchema));
      // A typebox `Record` emits `patternProperties` (open string keys) and no
      // `properties`; map it to a zod record over its value schema.
      const patternValue = node.patternProperties
        ? Object.values(node.patternProperties)[0]
        : undefined;
      return z.record(
        z.string(),
        patternValue ? toZodType(patternValue) : z.unknown(),
      );
    }
    default:
      // No `type` (e.g. typebox `Unknown`) → an unconstrained value.
      return z.unknown();
  }
}
