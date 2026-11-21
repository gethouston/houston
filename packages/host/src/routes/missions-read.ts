import type { ServerResponse } from "node:http";
import {
  loadActivities,
  missionConversationId,
  missionConversationKey,
} from "@houston/domain";
import type { ChatMessage } from "@houston/protocol";
import { conversationKey } from "../paths";
import { json } from "./http";
import {
  forwardMissionList,
  forwardMissionRead,
} from "./missions-remote-forward";
import type { MissionsCtx } from "./missions-sandbox";
import { refuseMissionRoute, resolveMissionRoute } from "./missions-target";

const DEFAULT_TAIL = 20;
const MAX_TAIL = 100;
const MAX_MESSAGE_CHARS = 4_000;

interface StoredConversation {
  title?: string;
  messages?: ChatMessage[];
}

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
      ...(missionConversationKey(a) === ctx.conversationId
        ? { this_conversation: true }
        : {}),
    }));
  json(res, 200, { missions });
}

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
  if (!mission)
    return json(res, 404, {
      error: "that mission is no longer on the board",
      code: "mission_not_found",
    });
  const candidates = [
    missionConversationId(id),
    missionConversationKey(mission),
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
      status: mission.status,
      title: conversation.title ?? mission.title,
      totalMessages: all.length,
      messages: all.slice(Math.max(0, all.length - limit)).map((m) => ({
        role: m.role,
        content: (m.content ?? "").slice(0, MAX_MESSAGE_CHARS),
      })),
    });
    return;
  }
  json(res, 200, {
    id,
    status: mission.status,
    title: mission.title,
    totalMessages: 0,
    messages: [],
  });
}

function tailLimit(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed)) return DEFAULT_TAIL;
  return Math.min(Math.max(parsed, 1), MAX_TAIL);
}
