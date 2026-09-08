import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import type { ProviderOption } from "@houston/domain";
import { currentTurnModel } from "../turn-model-context";
import type { MissionCall } from "./mission-call";
import {
  resolveTargetAgent,
  type StartMissionParams,
  startMissionParams,
} from "./mission-params";
import { missionPin, missionRunsOn, resolveMissionPin } from "./mission-pin";
import { START_MISSION_TOOL_NAME } from "./mission-tool-names";
import { type SessionToolErrorDetails, toolErrorResult } from "./tool-error";

/** What one start did: the mission it put on a board, or why it did not. */
export type StartMissionDetails =
  | {
      ok: true;
      id: string;
      title: string;
      agent?: string;
      provider?: string;
      model?: string;
    }
  | SessionToolErrorDetails;

/**
 * `start_mission`: the tool that fans a chat's work out into its own background
 * mission on the board the user watches.
 *
 * It owns the provider/model pin, which has two clocks. The accepted values in
 * the SCHEMA are a snapshot taken as the def is built, because the def is cached
 * for the whole session; the values actually ENFORCED, and the ones a refusal
 * names, come from `resolveProviders()` inside `execute` — that call runs in the
 * turn's async scope, so it reads the acting member's provider status as it
 * stands during this turn.
 */

const ASSISTANT_DESCRIPTION =
  "Start a new mission on the board of the agent you name, running in the background as its own chat. This is how work actually gets done: name the agent whose board this work belongs on, give it a complete standalone prompt, and it starts once your current turn ends. Check on it later with list_missions and read_mission on that same agent. On success, tell the user in plain words which agent is doing it.";

const AGENT_DESCRIPTION =
  "Start a new mission on the user's board, running in the background as its own chat. Use when the user asks to kick off separate workstreams, or a task splits into independent pieces they want tracked separately. The mission starts after your current turn ends; check on it later with list_missions and read_mission. Start only missions the user asked for or clearly wants, never more than a few at once. On success, tell the user in plain words which mission you started.";

export interface StartMissionOptions {
  call: MissionCall;
  personalAssistant: boolean;
  /** The provider status the schema's accepted values are built from. */
  providers: readonly ProviderOption[];
  /** The provider status a pin is judged against, read per execution. */
  resolveProviders: () => readonly ProviderOption[];
}

export function makeStartMissionTool(opts: StartMissionOptions) {
  const assistant = opts.personalAssistant;
  return defineTool({
    name: START_MISSION_TOOL_NAME,
    label: "Start a mission",
    description: assistant ? ASSISTANT_DESCRIPTION : AGENT_DESCRIPTION,
    promptSnippet: "Start a new mission on the board",
    parameters: startMissionParams(assistant, opts.providers),
    executionMode: "sequential",
    async execute(
      _id,
      params: StartMissionParams,
      signal,
    ): Promise<AgentToolResult<StartMissionDetails>> {
      const target = await resolveTargetAgent(
        params.agent,
        assistant,
        opts.call.sandbox,
        signal,
      );
      if (!target.ok) return toolErrorResult(target.error);
      const agent = target.agent;
      const inherited = currentTurnModel();
      // One read for the whole call, so the pin that is accepted and the
      // sentence that reports it can never describe different provider status.
      const live = opts.resolveProviders();
      const pin = missionPin(
        resolveMissionPin(params, live, inherited?.provider),
        inherited,
      );
      const body = {
        ...params,
        ...(agent ? { agent } : {}),
        // Resolved (id, display name or alias) BEFORE the inheritance default,
        // so a mission never carries a name the host has to guess at — and a
        // value nothing matches is refused above, naming every id it could
        // have used.
        ...pin,
      };
      const r = (await opts.call("POST", "/start", body, signal)) as {
        id: string;
        title: string;
      };
      return {
        content: [
          {
            type: "text" as const,
            text: `Started mission "${r.title}" (id ${r.id})${agent ? ` on ${agent}` : ""}.${missionRunsOn(pin, live)} It starts after this turn ends - check it later with list_missions or read_mission.`,
          },
        ],
        details: {
          ok: true,
          id: r.id,
          title: r.title,
          ...(agent ? { agent } : {}),
          ...pin,
        },
      };
    },
  });
}
