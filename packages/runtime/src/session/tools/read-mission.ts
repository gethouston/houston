import type { AgentToolResult } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import {
  type ReadMissionParams,
  readMissionParams,
  resolveTargetAgent,
} from "./mission-params";
import {
  type MissionTranscript,
  ownTranscript,
  targetTranscript,
} from "./mission-transcript";
import type { SandboxFetch } from "./sandbox-fetch";
import { type SessionToolErrorDetails, toolErrorResult } from "./tool-error";

/**
 * Read another mission's recent conversation (PRODUCT-1244) — the review half
 * of the planning-agent loop. The agent's OWN missions are read IN-PROCESS:
 * their transcripts live in this runtime's store, so there is nothing to proxy
 * and no secret involved. A mission on ANOTHER agent runs in another runtime,
 * so naming an agent reads it through the host instead. Output is bounded
 * either way so a long mission can never flood the calling turn's context (the
 * same concern that capped integration_execute results, HOU-893).
 */
export const READ_MISSION_TOOL_NAME = "read_mission";

/** Most messages one read returns (the tail), and per-message/total caps. */
const DEFAULT_TAIL = 20;
const MAX_MESSAGE_CHARS = 1_500;
const MAX_TOTAL_CHARS = 24_000;

export interface ReadMissionToolOptions {
  call: SandboxFetch;
  /** True when this runtime is the user's personal assistant — see missions.ts. */
  personalAssistant: boolean;
}

/** What one read did: the mission it read, or the named reason it could not. */
export type ReadMissionDetails =
  | { ok: true; id: string; totalMessages: number; agent?: string }
  | SessionToolErrorDetails;

/** The bounded, chronological render of a transcript. */
function render(transcript: MissionTranscript): string {
  // Fill newest-first so the total cap drops the OLDEST lines — the recent
  // outcome is what a review needs — then restore chronological order.
  const lines: string[] = [];
  let budget = MAX_TOTAL_CHARS;
  for (let i = transcript.messages.length - 1; i >= 0; i--) {
    const m = transcript.messages[i];
    const text = (m?.content ?? "").trim();
    if (!m || !text) continue;
    const clipped =
      text.length > MAX_MESSAGE_CHARS
        ? `${text.slice(0, MAX_MESSAGE_CHARS)}\n[... trimmed]`
        : text;
    const line = `[${m.role}] ${clipped}`;
    if (budget - line.length < 0) {
      lines.push("[... earlier messages omitted to stay within bounds]");
      break;
    }
    budget -= line.length;
    lines.push(line);
  }
  lines.reverse();
  const shown = transcript.messages.length;
  const header = `Mission "${transcript.title}" - showing the last ${shown} of ${transcript.totalMessages} messages.`;
  return `${header}\n\n${lines.join("\n\n")}`;
}

export function makeReadMissionTool(opts: ReadMissionToolOptions) {
  const assistant = opts.personalAssistant;
  return defineTool({
    name: READ_MISSION_TOOL_NAME,
    label: "Review a mission",
    description: assistant
      ? "Read the recent conversation of one mission by id (from list_missions) on the agent you name, to review what it produced before reporting back to the user, moving it on that agent's board, or removing it with the Houston operation deleteActivity."
      : "Read the recent conversation of one mission by id (from list_missions), to review its result or progress before reporting back or moving it on the board. Returns the last messages of that mission's chat.",
    promptSnippet: "Read another mission's conversation",
    parameters: readMissionParams(assistant, DEFAULT_TAIL),
    executionMode: "sequential",
    async execute(
      _id,
      params: ReadMissionParams,
      signal,
    ): Promise<AgentToolResult<ReadMissionDetails>> {
      const target = await resolveTargetAgent(
        params.agent,
        assistant,
        opts.call,
        signal,
      );
      if (!target.ok) return toolErrorResult(target.error);
      const agent = target.agent;
      const limit = Math.min(
        Math.max(Math.floor(params.limit ?? DEFAULT_TAIL), 1),
        100,
      );
      let transcript: MissionTranscript | null;
      if (agent) {
        const read = await targetTranscript(
          opts.call,
          agent,
          params.id,
          limit,
          signal,
        );
        if (!read.ok) return toolErrorResult(read.error);
        transcript = read.transcript;
      } else {
        transcript = ownTranscript(params.id, limit);
      }
      if (!transcript) {
        return toolErrorResult({
          code: "mission_not_found",
          message: `No conversation was found for the mission id ${JSON.stringify(params.id)}. Check list_missions for the ids that exist; a mission that has only just started may not have begun talking yet.`,
        });
      }
      return {
        content: [{ type: "text" as const, text: render(transcript) }],
        details: {
          ok: true,
          id: params.id,
          totalMessages: transcript.totalMessages,
          ...(agent ? { agent } : {}),
        },
      };
    },
  });
}
