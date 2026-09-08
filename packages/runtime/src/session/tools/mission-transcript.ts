import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "../../config";
import { getHistory } from "../../store/conversations";
import { agentQuery } from "./mission-params";
import type { SandboxFetch } from "./sandbox-fetch";
import { hostErrorFrom, type SessionToolErrorDetails } from "./tool-error";

/**
 * WHERE one mission's conversation comes from. The calling agent's OWN missions
 * live in this runtime's transcript store, so they are read in-process with
 * nothing to proxy and no secret involved; a mission on ANOTHER agent runs in
 * another runtime, so it is read through the host. `read_mission` renders
 * either the same way, which is the whole reason both shapes meet here.
 */

/** One mission's messages, from either source, in the shape the tool renders. */
export interface MissionTranscript {
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
export function ownTranscript(
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
export async function targetTranscript(
  call: SandboxFetch,
  agent: string,
  missionId: string,
  limit: number,
  signal: AbortSignal | undefined,
): Promise<
  { ok: true; transcript: MissionTranscript } | SessionToolErrorDetails
> {
  const query = `${agentQuery(agent)}&id=${encodeURIComponent(missionId)}&limit=${limit}`;
  const res = await call(`/sandbox/missions/read${query}`, {
    method: "GET",
    signal,
  });
  // The host's bodies are agent-actionable plain language (unknown agent, no
  // conversation yet) — relayed, so the agent corrects itself.
  if (!res.ok) {
    return { ok: false, error: await hostErrorFrom(res, "read_mission") };
  }
  return { ok: true, transcript: (await res.json()) as MissionTranscript };
}
