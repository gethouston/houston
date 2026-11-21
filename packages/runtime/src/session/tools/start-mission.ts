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

const ASSISTANT_DESCRIPTION =
  "Start a new mission on the board of the agent you name, running in the background as its own chat. This is how work actually gets done: name the agent whose board this work belongs on, give it a complete standalone prompt, and it starts once your current turn ends. Check on it later with list_missions and read_mission on that same agent. On success, tell the user in plain words which agent is doing it. Once a mission exists, the Houston operations own it: deleteActivity removes one and listActivities reads a board.";

const AGENT_DESCRIPTION =
  "Start a new mission on the user's board, running in the background as its own chat. It starts after your current turn ends; check on it later with list_missions and read_mission. On success, tell the user in plain words which mission you started.";

export interface StartMissionOptions {
  call: MissionCall;
  personalAssistant: boolean;
  providers: readonly ProviderOption[];
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
      const live = opts.resolveProviders();
      const resolved = resolveMissionPin(params, live, inherited?.provider);
      if (!resolved.ok) return toolErrorResult(resolved.error);
      const pin = missionPin(resolved.pin, inherited);
      const body = {
        ...params,
        ...(agent ? { agent } : {}),
        ...pin,
      };
      const result = await opts.call<{
        id: string;
        title: string;
        provider?: string;
        model?: string;
      }>("POST", "/start", body, signal);
      if (!result.ok) return toolErrorResult(result.error);
      const r = result.data;
      const effective =
        r.provider !== undefined || r.model !== undefined
          ? { provider: r.provider, model: r.model }
          : pin;
      return {
        content: [
          {
            type: "text" as const,
            text: `Started mission "${r.title}" (id ${r.id})${agent ? ` on ${agent}` : ""}.${missionRunsOn(effective, live)} It starts after this turn ends - check it later with list_missions or read_mission.`,
          },
        ],
        details: {
          ok: true,
          id: r.id,
          title: r.title,
          ...(agent ? { agent } : {}),
          ...effective,
        },
      };
    },
  });
}
