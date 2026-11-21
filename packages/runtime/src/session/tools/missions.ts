import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import type { ProviderOption } from "@houston/domain";
import { connectedProviderChoices } from "../../ai/provider-choices";
import { missionCall } from "./mission-call";
import {
  agentQuery,
  type ListMissionsParams,
  listMissionsParams,
  resolveTargetAgent,
  type UpdateMissionStatusParams,
  updateMissionStatusParams,
} from "./mission-params";
import {
  LIST_MISSIONS_TOOL_NAME,
  UPDATE_MISSION_STATUS_TOOL_NAME,
} from "./mission-tool-names";
import type { SandboxFetch } from "./sandbox-fetch";
import { makeStartMissionTool } from "./start-mission";
import { type SessionToolErrorDetails, toolErrorResult } from "./tool-error";

export type ListMissionsDetails =
  | { ok: true; count: number }
  | SessionToolErrorDetails;

export type UpdateMissionStatusDetails =
  | { ok: true; id: string; status: string }
  | SessionToolErrorDetails;

export interface MissionToolOptions {
  call: SandboxFetch;
  personalAssistant: boolean;
  providers?: readonly ProviderOption[];
  resolveProviders?: () => readonly ProviderOption[];
}

export function makeMissionTools(opts: MissionToolOptions) {
  const assistant = opts.personalAssistant;
  const providers = opts.providers ?? connectedProviderChoices();
  const resolveProviders =
    opts.resolveProviders ??
    (opts.providers ? () => providers : connectedProviderChoices);
  const call = missionCall(opts.call);

  const start = makeStartMissionTool({
    call,
    personalAssistant: assistant,
    providers,
    resolveProviders,
  });

  const list = defineTool({
    name: LIST_MISSIONS_TOOL_NAME,
    label: "Check the board",
    description: assistant
      ? "See one agent's mission board: every mission on it with its status. Statuses: 'running' (working or waiting to start), 'needs_you' (finished or blocked, awaiting review), 'error' (failed), 'done', 'archived'. Name the agent whose board you want - use it to check on work you started there, and to avoid starting the same thing twice. The Houston operation listActivities reads the same board, and deleteActivity is what removes a mission from it."
      : "See the user's mission board: every mission with its status. Statuses: 'running' (working or waiting to start), 'needs_you' (finished or blocked, awaiting review), 'error' (failed), 'done', 'archived'. Use it to check on missions you started, avoid duplicates before starting new ones, or answer what's in flight.",
    promptSnippet: "List the missions on the board",
    parameters: listMissionsParams(assistant),
    executionMode: "sequential",
    async execute(
      _id,
      params: ListMissionsParams,
      signal,
    ): Promise<AgentToolResult<ListMissionsDetails>> {
      const target = await resolveTargetAgent(
        params.agent,
        assistant,
        call.sandbox,
        signal,
      );
      if (!target.ok) return toolErrorResult(target.error);
      const result = await call<{ missions: unknown[] }>(
        "GET",
        agentQuery(target.agent),
        undefined,
        signal,
      );
      if (!result.ok) return toolErrorResult(result.error);
      const missions = result.data?.missions;
      if (!Array.isArray(missions)) {
        return toolErrorResult({
          code: "host_error",
          message:
            "The board came back in a shape this tool could not read. Try again, and tell the user plainly if it keeps happening.",
        });
      }
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(missions, null, 2) },
        ],
        details: { ok: true, count: missions.length },
      };
    },
  });

  const MOVE_DESCRIPTION =
    "Move a finished mission on the user's board to 'done' (reviewed and complete) or 'archived' (put away). Only works on missions that already finished - never one still running, and never the mission this chat belongs to. Move a mission only when the user asked you to manage it, or you started it yourself and reviewed its outcome with read_mission first. On another AI Employee's board you can only move missions you started.";
  const updateStatus = defineTool({
    name: UPDATE_MISSION_STATUS_TOOL_NAME,
    label: "Move a mission",
    description: assistant
      ? `${MOVE_DESCRIPTION} Deleting a mission is NOT this tool: use the Houston operation deleteActivity, which asks the user to confirm first. Never archive something the user asked you to delete.`
      : MOVE_DESCRIPTION,
    promptSnippet: "Move a mission to done or archived",
    parameters: updateMissionStatusParams(assistant),
    executionMode: "sequential",
    async execute(
      _id,
      params: UpdateMissionStatusParams,
      signal,
    ): Promise<AgentToolResult<UpdateMissionStatusDetails>> {
      const target = await resolveTargetAgent(
        params.agent,
        assistant,
        call.sandbox,
        signal,
      );
      if (!target.ok) return toolErrorResult(target.error);
      const agent = target.agent;
      const result = await call<{ id: string; status: string }>(
        "POST",
        "/status",
        { ...params, ...(agent ? { agent } : {}) },
        signal,
      );
      if (!result.ok) return toolErrorResult(result.error);
      const r = result.data;
      return {
        content: [
          {
            type: "text" as const,
            text: `Moved the mission to ${r.status}. Tell the user in plain words.`,
          },
        ],
        details: { ok: true, id: r.id, status: r.status },
      };
    },
  });

  return [start, list, updateStatus];
}
