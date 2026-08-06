import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { config } from "../../config";
import { getHistory } from "../../store/conversations";

/**
 * Read another mission's recent conversation (PRODUCT-1244) — the review half
 * of the planning-agent loop. Unlike its siblings in missions.ts this tool is
 * IN-PROCESS: every mission's transcript lives in this runtime's own store, so
 * there is nothing to proxy and no secret involved. Output is bounded so a long
 * mission can never flood the calling turn's context (the same concern that
 * capped integration_execute results, HOU-893).
 */
export const READ_MISSION_TOOL_NAME = "read_mission";

/** Most messages one read returns (the tail), and per-message/total caps. */
const DEFAULT_TAIL = 20;
const MAX_MESSAGE_CHARS = 1_500;
const MAX_TOTAL_CHARS = 24_000;

const ReadMissionParams = Type.Object({
  id: Type.String({ description: "The mission id, from list_missions." }),
  limit: Type.Optional(
    Type.Number({
      description: `How many recent messages to read (default ${DEFAULT_TAIL}, max 100).`,
    }),
  ),
});
type ReadMissionParams = Static<typeof ReadMissionParams>;

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

export function makeReadMissionTool() {
  return defineTool({
    name: READ_MISSION_TOOL_NAME,
    label: "Review a mission",
    description:
      "Read the recent conversation of one mission by id (from list_missions), to review its result or progress before reporting back or moving it on the board. Returns the last messages of that mission's chat.",
    promptSnippet: "Read another mission's conversation",
    parameters: ReadMissionParams,
    executionMode: "sequential",
    async execute(_id, params: ReadMissionParams) {
      const limit = Math.min(
        Math.max(Math.floor(params.limit ?? DEFAULT_TAIL), 1),
        100,
      );
      let history = null;
      for (const cid of conversationIdsFor(params.id)) {
        history = getHistory(cid, { limit });
        if (history) break;
      }
      if (!history) {
        throw new Error(
          "no conversation found for that mission id - check list_missions; a just-started mission may not have begun yet",
        );
      }
      // Fill newest-first so the total cap drops the OLDEST lines — the recent
      // outcome is what a review needs — then restore chronological order.
      const lines: string[] = [];
      let budget = MAX_TOTAL_CHARS;
      for (let i = history.messages.length - 1; i >= 0; i--) {
        const m = history.messages[i];
        const text = (m.content ?? "").trim();
        if (!text) continue;
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
      const shown = history.messages.length;
      const header = `Mission "${history.title}" - showing the last ${shown} of ${history.totalMessages} messages.`;
      return {
        content: [
          { type: "text" as const, text: `${header}\n\n${lines.join("\n\n")}` },
        ],
        details: { id: params.id, totalMessages: history.totalMessages },
      };
    },
  });
}
