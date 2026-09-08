import type { ProviderOption } from "@houston/domain";
import type { TurnMode } from "@houston/protocol";
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
import type { BridgedPiTool } from "./mcp-tool-adapter";

/** Which pi tools a runtime bridges onto the Claude backend, and under what gates. */
export interface BridgedToolSetInput {
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

/** The pi tools this runtime bridges, after the coordinator clamp and mode filter. */
export function buildBridgedToolSet(
  input: BridgedToolSetInput,
): BridgedPiTool[] {
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
  return scoped.filter((t) => allowed.has(t.name));
}
