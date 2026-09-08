import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { config } from "../../config";
import { getHistory } from "../../store/conversations";
import {
  agentQuery,
  type ReadMissionParams,
  readMissionParams,
  targetAgent,
} from "./mission-params";
import type { SandboxFetch } from "./sandbox-fetch";

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

/** One mission's messages, from either source, in the shape the tool renders. */
interface MissionTranscript {
  title: string;
  messages: { role: string; content: string }[];
  totalMessages: number;
}

/** The mission's conversation id: `activity-<id>` by convention, with the
 *  explicit `session_key` from activity.json as the fallback for missions
 *  whose chat was keyed differently (legacy imports). Best-effort file read —
 *  the convention covers every mission this feature starts. */
function conversationIdsFor(missionId: string): string[] {
  const ids = [`activity-${missionId}`];
  try {
    const raw = readFileSync(
      join(config.workspaceDir, ".houston", "activity", "activity.json"),
      "utf8",
    );
    const items = JSON.parse(raw) as unknown;
    if (Array.isArray(items)) {
      const match = items.find(
        (a) =>
          typeof a === "object" &&
          a !== null &&
          (a as { id?: unknown }).id === missionId,
      ) as { session_key?: unknown; claude_session_id?: unknown } | undefined;
      for (const key of [match?.session_key, match?.claude_session_id]) {
        if (typeof key === "string" && key && !ids.includes(key)) ids.push(key);
      }
    }
  } catch {
    // No readable activity.json — the convention id above still covers the
    // normal case; a genuinely unknown mission errors below with guidance.
  }
  return ids;
}

/** This runtime's own transcript for the mission, or null. */
function ownTranscript(
  missionId: string,
  limit: number,
): MissionTranscript | null {
  for (const cid of conversationIdsFor(missionId)) {
    const history = getHistory(cid, { limit });
    if (history) {
      return {
        title: history.title,
        messages: history.messages.map((m) => ({
          role: m.role,
          content: m.content ?? "",
        })),
        totalMessages: history.totalMessages ?? history.messages.length,
      };
    }
  }
  return null;
}

/** Another agent's transcript, served by the host from its file store. */
async function targetTranscript(
  opts: ReadMissionToolOptions,
  agent: string,
  missionId: string,
  limit: number,
  signal: AbortSignal | undefined,
): Promise<MissionTranscript> {
  const query = `${agentQuery(agent)}&id=${encodeURIComponent(missionId)}&limit=${limit}`;
  const res = await opts.call(`/sandbox/missions/read${query}`, {
    method: "GET",
    signal,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    // The host's bodies are agent-actionable plain language (unknown agent, no
    // conversation yet) — relay them so the agent corrects itself.
    throw new Error(
      `read_mission failed (${res.status}): ${detail.slice(0, 300)}`,
    );
  }
  return (await res.json()) as MissionTranscript;
}

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
      ? "Read the recent conversation of one mission by id (from list_missions) on the agent you name, to review what it produced before reporting back to the user or moving it on that agent's board."
      : "Read the recent conversation of one mission by id (from list_missions), to review its result or progress before reporting back or moving it on the board. Returns the last messages of that mission's chat.",
    promptSnippet: "Read another mission's conversation",
    parameters: readMissionParams(assistant, DEFAULT_TAIL),
    executionMode: "sequential",
    async execute(_id, params: ReadMissionParams, signal) {
      const agent = targetAgent(params.agent, assistant);
      const limit = Math.min(
        Math.max(Math.floor(params.limit ?? DEFAULT_TAIL), 1),
        100,
      );
      const transcript = agent
        ? await targetTranscript(opts, agent, params.id, limit, signal)
        : ownTranscript(params.id, limit);
      if (!transcript) {
        throw new Error(
          "no conversation found for that mission id - check list_missions; a just-started mission may not have begun yet",
        );
      }
      return {
        content: [{ type: "text" as const, text: render(transcript) }],
        details: {
          id: params.id,
          totalMessages: transcript.totalMessages,
          ...(agent ? { agent } : {}),
        },
      };
    },
  });
}
