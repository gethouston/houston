import type { ServerResponse } from "node:http";
import { loadActivities } from "@houston/domain";
import type { ChatMessage } from "@houston/protocol";
import { conversationKey } from "../paths";
import { json } from "./http";
import {
  forwardMissionList,
  forwardMissionRead,
} from "./missions-remote-forward";
import { type MissionsCtx, missionSessionKey } from "./missions-sandbox";
import { refuseMissionRoute, resolveMissionRoute } from "./missions-target";

/**
 * The READ half of the agent's mission tools: the board snapshot
 * (`GET /sandbox/missions`) and one mission's transcript
 * (`GET /sandbox/missions/read`). Both take an optional `agent` — the board a
 * caller reads is its own unless it names another.
 *
 * The transcript read exists for CROSS-agent review only. An agent reviewing
 * its OWN mission reads its runtime's in-process store (tools/read-mission.ts);
 * another agent's transcript lives in another runtime, so the host serves it
 * from the file store — the same conversation key the routine reconciler reads
 * (schedule/reconcile.ts). A named agent that lives in ANOTHER POD is asked
 * for its own answer (missions-remote-forward.ts) and it is relayed unchanged,
 * so a review reads the same shape wherever the mission runs.
 */

/** Most messages one read returns (the tail), and the per-message transport clip. */
const DEFAULT_TAIL = 20;
const MAX_TAIL = 100;
const MAX_MESSAGE_CHARS = 4_000;

/** The transcript file's shape — the runtime's StoredConversation, as read. */
interface StoredConversation {
  title?: string;
  messages?: ChatMessage[];
}

/** The board snapshot, newest first, in the compact shape the agent reads. */
export async function handleList(
  callerCtx: MissionsCtx,
  url: URL,
  res: ServerResponse,
): Promise<void> {
  const route = await resolveMissionRoute(
    callerCtx,
    url.searchParams.get("agent") ?? undefined,
  );
  if (!route.ok) return refuseMissionRoute(route, res);
  if (route.remote) {
    await forwardMissionList(route.route, res);
    return;
  }
  const ctx = route.ctx;
  const { items } = await loadActivities(ctx.vfs, ctx.root);
  const missions = items
    .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))
    .slice(0, 100)
    .map((a) => ({
      id: a.id,
      title: a.title,
      status: a.status,
      ...(a.updated_at ? { updated_at: a.updated_at } : {}),
      ...(a.origin_session_key ? { agent_started: true } : {}),
      ...(a.routine_id ? { from_routine: true } : {}),
      ...(missionSessionKey(a) === ctx.conversationId
        ? { this_conversation: true }
        : {}),
    }));
  json(res, 200, { missions });
}

/** One mission's recent messages, read from the owning agent's file store. */
export async function handleMissionRead(
  callerCtx: MissionsCtx,
  url: URL,
  res: ServerResponse,
): Promise<void> {
  const route = await resolveMissionRoute(
    callerCtx,
    url.searchParams.get("agent") ?? undefined,
  );
  if (!route.ok) return refuseMissionRoute(route, res);
  const id = url.searchParams.get("id")?.trim() ?? "";
  if (!id) {
    return json(res, 400, {
      error: "pass the mission's 'id' - see list_missions",
      code: "invalid_mission",
    });
  }
  const rawLimit = url.searchParams.get("limit");
  if (route.remote) {
    await forwardMissionRead(
      route.route,
      { id, ...(rawLimit ? { limit: rawLimit } : {}) },
      res,
    );
    return;
  }
  const ctx = route.ctx;
  const limit = tailLimit(rawLimit);
  const { items } = await loadActivities(ctx.vfs, ctx.root);
  const mission = items.find((a) => a.id === id);
  // The convention id covers every mission this feature starts; an explicit
  // `session_key` covers a mission whose chat was keyed differently.
  const candidates = [
    `activity-${id}`,
    ...(mission ? [missionSessionKey(mission)] : []),
  ];
  for (const cid of new Set(candidates)) {
    const raw = await ctx.vfs.readText(
      conversationKey(ctx.paths, ctx.ws, ctx.agent, cid),
    );
    if (!raw) continue;
    const conversation = JSON.parse(raw) as StoredConversation;
    const all = conversation.messages ?? [];
    json(res, 200, {
      id,
      title: conversation.title ?? mission?.title ?? "",
      totalMessages: all.length,
      messages: all.slice(Math.max(0, all.length - limit)).map((m) => ({
        role: m.role,
        content: (m.content ?? "").slice(0, MAX_MESSAGE_CHARS),
      })),
    });
    return;
  }
  json(res, 404, {
    error:
      "that mission has no conversation yet - check list_missions; a just-started mission may not have begun",
    code: "mission_not_found",
  });
}

function tailLimit(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed)) return DEFAULT_TAIL;
  return Math.min(Math.max(parsed, 1), MAX_TAIL);
}
