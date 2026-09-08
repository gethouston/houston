import { normalizeTurnMode } from "@houston/protocol";
import { evict, isTurnRunning } from "../session/bus";
import {
  cancelTurn,
  disposeConversation,
  setLiveTurnMode,
} from "../session/chat";
import { summarizeTitle, titleFromText } from "../session/summarize";
import { truncateConversationTurn } from "../session/truncate-turn";
import {
  deleteConversation,
  getHistory,
  listConversations,
  markConversationStopped,
  renameConversation,
} from "../store/conversations";
import { handleStartTurn } from "./conversation-start-turn";
import { handleConversationEvents } from "./events-route";
import { json, type RouteContext, readJson } from "./http-helpers";

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
    /^\/conversations\/([^/]+)\/(messages|events|cancel|dismiss-interaction|title|mode|truncate)$/,
  );
  if (!convMatch) return false;

  const id = decodeURIComponent(convMatch[1]);
  const action = convMatch[2];

  if (method === "GET" && action === "messages") {
    // Optional transcript window (HOU-819): `limit` = tail size, `before` =
    // the caller's current `offset` (fetch the previous page). Absent or
    // malformed params fall back to the full history — the pre-windowing
    // contract — so an old client (or a proxy that strips query strings)
    // keeps working, just without the windowing win.
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
    // The card that triggers this is never shown mid-turn, so a running turn
    // here means the user raced a live turn — answer 409 and let them Stop
    // (which retires the turn AND stamps the durable stop) instead of writing a
    // second marker behind the executing turn. Idle: append the stop marker,
    // retiring the pending interaction exactly as a real Stop does.
    if (isTurnRunning(id)) {
      json(res, 409, { error: "turn running" });
      return true;
    }
    markConversationStopped(id);
    json(res, 200, { ok: true });
    return true;
  }
  if (method === "POST" && action === "mode") {
    // The Mode pill switched WHILE the agent works: apply it to the executing
    // turn's live-mode ref (Claude Code's shift+tab). `applied: false` is
    // benign — no turn is running, and the next send pins the mode itself.
    // Never trust the wire: unknown values normalize to "execute".
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
    // Edit-and-resend (PRODUCT-1217): cut the transcript at the named user
    // turn. The client follows up with a normal POST …/messages carrying the
    // edited text, so this route only rewinds — it never starts a turn.
    const { turnId } = await readJson(ctx.req);
    if (!turnId || typeof turnId !== "string") {
      json(res, 400, { error: "missing 'turnId'" });
      return true;
    }
    const result = await truncateConversationTurn(id, turnId);
    if (result === "busy") json(res, 409, { error: "turn running" });
    else if (result === "not_found")
      json(res, 404, { error: "turn not found" });
    else json(res, 200, { ok: true, removed: result.removed });
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
    // Drop the event channel with the transcript: any outstanding resume
    // cursor for a deleted conversation is unserviceable by definition, so a
    // reconnect gets a resync against the (now empty) history — correct.
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

/** Parse an integer query param ≥ `min` (default 1); anything else → undefined. */
function positiveInt(raw: string | null, min = 1): number | undefined {
  if (raw === null) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n >= min ? n : undefined;
}
