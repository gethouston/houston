import { normalizeTurnMode } from "@houston/protocol";
import { evict } from "../session/bus";
import {
  cancelTurn,
  disposeConversation,
  setLiveTurnMode,
} from "../session/chat";
import { conversationCommandBusy } from "../session/conversation-command-gate";
import { summarizeTitle, titleFromText } from "../session/summarize";
import { truncateConversationTurn } from "../session/truncate-turn";
import {
  deleteConversation,
  getHistory,
  listConversations,
  markConversationStopped,
  renameConversation,
} from "../store/conversations";
import { handleConversationImport } from "./conversation-import-route";
import { handleStartTurn } from "./conversation-start-turn";
import { handleConversationEvents } from "./events-route";
import { json, type RouteContext, readJson } from "./http-helpers";
import { refuseNonCardOwner } from "./interaction-owner-gate";

export async function handleConversationRoute(
  ctx: RouteContext,
): Promise<boolean> {
  const { method, path, res } = ctx;

  if (method === "GET" && path === "/conversations") {
    json(res, 200, listConversations());
    return true;
  }
  if (method === "POST" && path === "/title") {
    await handleTitleFromText(ctx);
    return true;
  }

  const convRootMatch = path.match(/^\/conversations\/([^/]+)$/);
  if (convRootMatch && (method === "PATCH" || method === "DELETE")) {
    await handleConversationRoot(ctx, decodeURIComponent(convRootMatch[1]));
    return true;
  }

  const convMatch = path.match(
    /^\/conversations\/([^/]+)\/(messages|events|cancel|dismiss-interaction|title|mode|truncate|import)$/,
  );
  if (!convMatch) return false;

  const id = decodeURIComponent(convMatch[1]);
  const action = convMatch[2];

  if (method === "GET" && action === "messages") {
    const history = getHistory(id, {
      limit: positiveInt(ctx.url.searchParams.get("limit")),
      before: positiveInt(ctx.url.searchParams.get("before"), 0),
    });
    history
      ? json(res, 200, history)
      : json(res, 404, { error: "conversation not found" });
    return true;
  }
  if (method === "GET" && action === "events") {
    handleConversationEvents(ctx, id);
    return true;
  }
  if (method === "POST" && action === "cancel") {
    const cancelled = await cancelTurn(id);
    json(res, 200, { ok: true, cancelled });
    return true;
  }
  if (method === "POST" && action === "dismiss-interaction") {
    if (conversationCommandBusy(id)) {
      json(res, 409, { error: "turn running" });
      return true;
    }
    if (refuseNonCardOwner(ctx, id)) return true;
    markConversationStopped(id);
    json(res, 200, { ok: true });
    return true;
  }
  if (method === "POST" && action === "mode") {
    const { mode } = await readJson(ctx.req);
    json(res, 200, {
      ok: true,
      applied: setLiveTurnMode(id, normalizeTurnMode(mode)),
    });
    return true;
  }
  if (method === "POST" && action === "title") {
    await handleConversationTitle(ctx, id);
    return true;
  }
  if (method === "POST" && action === "truncate") {
    const { turnId } = await readJson(ctx.req);
    if (!turnId || typeof turnId !== "string") {
      json(res, 400, { error: "missing 'turnId'" });
      return true;
    }
    if (refuseNonCardOwner(ctx, id)) return true;
    const result = await truncateConversationTurn(id, turnId);
    if (result === "busy") json(res, 409, { error: "turn running" });
    else if (result === "not_found")
      json(res, 404, { error: "turn not found" });
    else json(res, 200, { ok: true, removed: result.removed });
    return true;
  }
  if (method === "POST" && action === "import") {
    await handleConversationImport(ctx, id);
    return true;
  }
  if (method === "POST" && action === "messages") {
    await handleStartTurn(ctx, id);
    return true;
  }

  return false;
}

async function handleTitleFromText(ctx: RouteContext) {
  const { text } = await readJson(ctx.req);
  if (typeof text !== "string") {
    json(ctx.res, 400, { error: "missing 'text'" });
    return;
  }
  try {
    json(ctx.res, 200, { title: await titleFromText(text) });
  } catch (e) {
    json(ctx.res, 400, { error: e instanceof Error ? e.message : String(e) });
  }
}

async function handleConversationRoot(ctx: RouteContext, id: string) {
  if (ctx.method === "PATCH") {
    const { title } = await readJson(ctx.req);
    if (!title || typeof title !== "string") {
      json(ctx.res, 400, { error: "missing 'title'" });
      return;
    }
    renameConversation(id, title)
      ? json(ctx.res, 200, { ok: true })
      : json(ctx.res, 404, { error: "conversation not found" });
    return;
  }
  if (ctx.method === "DELETE") {
    await disposeConversation(id, { deleteSessions: true });
    evict(id);
    deleteConversation(id)
      ? json(ctx.res, 200, { ok: true })
      : json(ctx.res, 404, { error: "conversation not found" });
  }
}

async function handleConversationTitle(ctx: RouteContext, id: string) {
  try {
    const title = await summarizeTitle(id);
    title
      ? json(ctx.res, 200, { title })
      : json(ctx.res, 404, { error: "conversation not found" });
  } catch (e) {
    json(ctx.res, 400, { error: e instanceof Error ? e.message : String(e) });
  }
}

function positiveInt(raw: string | null, min = 1): number | undefined {
  if (raw === null) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n >= min ? n : undefined;
}
