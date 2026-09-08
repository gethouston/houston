import type {
  createSdkMcpServer as CreateSdkMcpServer,
  McpSdkServerConfigWithInstance,
  SdkMcpToolDefinition,
} from "@anthropic-ai/claude-agent-sdk";
import type {
  AgentToolResult,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { ProviderOption } from "@houston/domain";
import type { TurnMode } from "@houston/protocol";
import type { TSchema } from "typebox";
import {
  COORDINATOR_TOOL_NAMES,
  toolNamesForMode,
} from "../../session/tool-selection";
import { makeAskUserTool } from "../../session/tools/ask-user";
import {
  type AssistantToolOptions,
  makeAssistantTools,
} from "../../session/tools/assistant";
import { makeCustomIntegrationTools } from "../../session/tools/custom-integrations";
import { makeSkillDirectoryTools } from "../../session/tools/find-skills";
import {
  type IntegrationToolOptions,
  makeIntegrationTools,
} from "../../session/tools/integrations";
import { makeMissionTools } from "../../session/tools/missions";
import { makePlanReadyTool } from "../../session/tools/plan-ready";
import { makeReadMissionTool } from "../../session/tools/read-mission";
import { makeSaveLearningTool } from "../../session/tools/save-learning";
import { makeSaveRoutineTool } from "../../session/tools/save-routine";
import { makeSuggestActionsTool } from "../../session/tools/suggest-actions";
import { makeSuggestReusableTool } from "../../session/tools/suggest-reusable";
import { toZodShape } from "./schema-to-zod";

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
export interface HoustonMcpInput {
  /** The SDK factory, passed in so this module never imports the optional SDK. */
  createSdkMcpServer: typeof CreateSdkMcpServer;
  /**
   * Integration proxy config when this runtime can reach its host with a sandbox
   * token — the SAME gate as the pi path (`config.controlPlaneUrl &&
   * config.sandboxToken`). Present → `request_connection` + `integration_search`
   * + `integration_execute` are built; absent → only `ask_user` is.
   */
  integrations?: IntegrationToolOptions;
  /**
   * The assistant family's catalog + host transport, on the SAME three gates the
   * pi path applies (deployment opted in, host reachable, catalog packaged).
   * Present → `houston_capabilities` + `houston_describe` + `houston_call` are
   * built; absent → none of them is. Separate from `integrations` because the
   * family is deployment-scoped, not credential-scoped.
   */
  assistant?: AssistantToolOptions;
  /**
   * True when this runtime IS the user's personal assistant — the coordinator.
   * Clamps the bridged set to {@link COORDINATOR_TOOL_NAMES}, the same surface
   * the pi path's `buildToolSelection` allowlists, so the two backends never
   * drift on what the assistant may do.
   */
  personalAssistant?: boolean;
  /** An already grant-scoped tool set for a disposable turn runtime. */
  tools?: BridgedPiTool[];
  /**
   * The provider status the mission tools build their `provider` choice from
   * (default: the runtime's own). Passed through so both backends can be built
   * from ONE snapshot — the enum the model sees must not depend on which
   * backend serves the turn.
   */
  providers?: readonly ProviderOption[];
  /**
   * The turn's execution mode, applied as the SAME tool filter the pi path uses
   * (`toolNamesForMode`): "plan" keeps `ask_user` + `plan_ready` (the acting
   * integration tools are withheld), "auto" drops `ask_user` (the one blocking
   * tool) and `plan_ready` while KEEPING `integration_search` /
   * `integration_execute` / `request_connection` (the queued connect card ends
   * the turn instead of holding it open — HOU-853), and "execute" (or absent)
   * exposes the full built set minus `plan_ready` (plan-only). `plan_ready`
   * never survives outside plan.
   * `suggest_reusable` mirrors the acting tools' reach — it survives execute AND
   * auto (it never blocks the turn) but never plan (plan is not a finished task).
   */
  mode?: TurnMode;
}

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
 * Build the single in-process MCP server exposing Houston's custom tools to the
 * Claude backend, plus the `allowedTools` entries that auto-approve them.
 */
export function buildHoustonMcpServer(input: HoustonMcpInput): HoustonMcp {
  // Reuse the EXISTING tool implementations verbatim; build the full set this
  // runtime could expose (ask_user + plan_ready always, the integration tools
  // when the gate is open), then apply the turn's mode filter — the SAME `toolNamesForMode`
  // the pi path clamps its name allowlist with, so the two backends never drift
  // on what a mode allows. On the pi path filtering the NAME list is enough (pi
  // gates custom tools by name); here the MCP server exposes exactly the tools it
  // is handed, so we filter the tool OBJECTS to the mode's allowed names. The
  // variance between a concrete pi `ToolDefinition<S>` and the widened adapter
  // shape is bridged by one documented assertion at this single boundary.
  const built =
    input.tools ??
    ([
      makeAskUserTool(),
      // plan_ready is in the built set but name-gated by `toolNamesForMode`: it
      // survives only on a plan turn (filtered out of execute/auto below).
      makePlanReadyTool(),
      // suggest_reusable is the inverse gating: name-kept in execute/auto, filtered
      // out of plan by `toolNamesForMode`.
      makeSuggestReusableTool(),
      makeSuggestActionsTool(),
      // save_routine reaches the host with the SAME sandbox token the integration
      // tools use (present ⟺ host reachable). It reaches execute/auto but never
      // plan — the same reach as suggest_reusable, applied by `toolNamesForMode`.
      ...(input.integrations ? [makeSaveRoutineTool(input.integrations)] : []),
      // save_learning reaches the host with the SAME sandbox token, and has the
      // same reach as save_routine: execute/auto, never plan.
      ...(input.integrations ? [makeSaveLearningTool(input.integrations)] : []),
      // The mission-board tools ride the same host-reachability gate and the
      // same execute/auto reach; read_mission reaches the host only for another
      // agent's mission, but is useless without list_missions either way, so it
      // shares the gate.
      ...(input.integrations
        ? [
            ...makeMissionTools({
              ...input.integrations,
              personalAssistant: input.personalAssistant ?? false,
              ...(input.providers ? { providers: input.providers } : {}),
            }),
            makeReadMissionTool({
              ...input.integrations,
              personalAssistant: input.personalAssistant ?? false,
            }),
          ]
        : []),
      // find_skills + install_skill reach the host with the SAME sandbox token,
      // and have the same reach as save_routine: execute/auto, never plan.
      ...(input.integrations
        ? makeSkillDirectoryTools(input.integrations)
        : []),
      // The assistant family rides its OWN gate (not the integrations one) and
      // has the same reach as save_routine: execute/auto, never plan.
      ...(input.assistant ? makeAssistantTools(input.assistant) : []),
      ...(input.integrations ? makeIntegrationTools(input.integrations) : []),
      ...(input.integrations
        ? makeCustomIntegrationTools(input.integrations)
        : []),
      // SAFETY: Houston's tool implementations satisfy BridgedPiTool at runtime;
      // the assertion only widens their heterogeneous TypeBox parameter types.
    ] as unknown as BridgedPiTool[]);
  const scoped = input.personalAssistant
    ? built.filter((t) => COORDINATOR_TOOL_NAMES.includes(t.name))
    : built;
  const allowed = new Set(
    toolNamesForMode(
      input.mode,
      scoped.map((t) => t.name),
    ),
  );
  const piTools = scoped.filter((t) => allowed.has(t.name));

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
