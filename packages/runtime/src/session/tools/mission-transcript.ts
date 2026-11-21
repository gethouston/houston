import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "../../config";
import { getHistory } from "../../store/conversations";
import { agentQuery } from "./mission-params";
import type { SandboxFetch } from "./sandbox-fetch";
import { hostErrorFrom, type SessionToolErrorDetails } from "./tool-error";

export interface MissionTranscript {
  title: string;
  status?: string;
  messages: { role: string; content: string }[];
  totalMessages: number;
}

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
  } catch {}
  return ids;
}

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

export async function targetTranscript(
  call: SandboxFetch,
  agent: string | undefined,
  missionId: string,
  limit: number,
  signal: AbortSignal | undefined,
): Promise<
  { ok: true; transcript: MissionTranscript } | SessionToolErrorDetails
> {
  const query = `${agentQuery(agent)}${agent ? "&" : "?"}id=${encodeURIComponent(missionId)}&limit=${limit}`;
  const res = await call(`/sandbox/missions/read${query}`, {
    method: "GET",
    signal,
  });
  if (!res.ok) {
    return { ok: false, error: await hostErrorFrom(res, "read_mission") };
  }
  return { ok: true, transcript: (await res.json()) as MissionTranscript };
}
