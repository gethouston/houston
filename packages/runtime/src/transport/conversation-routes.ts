import { normalizeTurnMode } from "@houston/protocol";
import type { ActingContext } from "../session/acting-context";
import { evict, isTurnRunning } from "../session/bus";
import {
  cancelTurn,
  disposeConversation,
  ensureProviderForTurn,
  runTurn,
} from "../session/chat";
import { summarizeTitle, titleFromText } from "../session/summarize";
import {
  deleteConversation,
  getHistory,
  listConversations,
  markConversationStopped,
  renameConversation,
} from "../store/conversations";
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
    /^\/conversations\/([^/]+)\/(messages|events|cancel|dismiss-interaction|title)$/,
  );
  if (!convMatch) return false;

  const id = decodeURIComponent(convMatch[1]);
  const action = convMatch[2];

  if (method === "GET" && action === "messages") {
    const history = getHistory(id);
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
  if (method === "POST" && action === "title") {
    await handleConversationTitle(ctx, id);
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

async function handleStartTurn(ctx: RouteContext, id: string) {
  const {
    text,
    nonce,
    model,
    effort,
    provider,
    mode,
    workspaceContext,
    userContext,
    displayText,
  } = await readJson(ctx.req);
  if (!text || typeof text !== "string") {
    json(ctx.res, 400, { error: "missing 'text'" });
    return;
  }
  // Never trust the wire: only the known mode literals ("plan", "auto") pass;
  // everything else (absent, garbage, unknown) normalizes to "execute".
  const turnMode = normalizeTurnMode(mode);
  // The hosting gateway (cloud) puts the org + caller context on the turn body
  // from its own store (HOU-711). Either field present means "use these" (each
  // defaults to ""), so a new session's prompt is built from them instead of the
  // local WORKSPACE.md / USER.md files. Absent on desktop/self-host → file path.
  const context =
    typeof workspaceContext === "string" || typeof userContext === "string"
      ? {
          workspace:
            typeof workspaceContext === "string" ? workspaceContext : "",
          user: typeof userContext === "string" ? userContext : "",
        }
      : undefined;
  // A provider-pinned turn (a routine) is never auth-gated on the ACTIVE
  // provider — the pin names its own; a disconnected pin surfaces as the
  // turn's provider error. The credential sync inside ensureProviderForTurn
  // still runs either way so the pinned provider's token is fresh.
  const pinnedProvider =
    typeof provider === "string" && provider ? provider : undefined;
  if (!(await ensureProviderForTurn()) && !pinnedProvider) {
    json(ctx.res, 409, {
      error: "No provider connected. Connect an AI provider first.",
    });
    return;
  }
  // WHO is driving this turn (C2): the host forwards the gateway's acting-as
  // token, or (routine turns) the creator's sub. Captured here and held for the
  // turn so the integration tools act as that user. Both absent → act as owner.
  const acting = actingFromHeaders(ctx.req.headers);
  void runTurn(
    id,
    text,
    typeof nonce === "string" ? nonce : undefined,
    {
      provider: pinnedProvider,
      model: typeof model === "string" ? model : undefined,
      effort: typeof effort === "string" ? effort : undefined,
      mode: turnMode,
    },
    acting,
    context,
    // Presentation-only bubble text (never trusted into the model input): the
    // model runs on `text`; this only changes what a history reload renders.
    typeof displayText === "string" ? displayText : undefined,
  );
  json(ctx.res, 202, { ok: true, id });
}

/** Extract the C2 acting-as identity from a message request's headers, or undefined. */
function actingFromHeaders(
  headers: RouteContext["req"]["headers"],
): ActingContext | undefined {
  const one = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const actingAs = one(headers["x-houston-acting-as"]);
  const actingUser = one(headers["x-houston-acting-user"]);
  return actingAs || actingUser ? { actingAs, actingUser } : undefined;
}
