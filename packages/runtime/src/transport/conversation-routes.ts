import { normalizeTurnMode, parseMentions } from "@houston/protocol";
import { actingFromHeaders } from "../session/acting-context";
import { evict, isTurnRunning } from "../session/bus";
import {
  cancelTurn,
  disposeConversation,
  ensureProviderForTurn,
  runTurn,
  setLiveTurnMode,
} from "../session/chat";
import { isDraining } from "../session/drain";
import { summarizeTitle, titleFromText } from "../session/summarize";
import { truncateConversationTurn } from "../session/truncate-turn";
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
    // Shutting down: the turns already running finish, new ones do not start
    // here. The answer is the gateway's own waking shape, byte for byte —
    // every client reads `503 {"error":"engine unavailable"}` as "the pod is
    // not there right now", re-sends the same message on its wake ladder,
    // and never shows an error. A new reason string would be a red toast on
    // every shipped client.
    if (isDraining()) {
      res.writeHead(503, {
        "Content-Type": "application/json; charset=utf-8",
        "Retry-After": "2",
      });
      res.end(
        JSON.stringify({
          error: "engine unavailable",
          detail: "the agent is restarting",
        }),
      );
      return true;
    }
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
    mentions,
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
    // `code` is the machine-readable half: the host's scheduler reads it to
    // demote a routine firing into this expected user state (nothing connected
    // yet) to a warning instead of a Sentry error (HOUSTON-APP-4XM).
    json(ctx.res, 409, {
      error: "No provider connected. Connect an AI provider first.",
      code: "no_provider",
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
    // The @mention sidecar (HOU-944), sanitized before it is persisted or
    // published: junk entries are dropped and an empty list becomes nothing.
    parseMentions(mentions),
  );
  json(ctx.res, 202, { ok: true, id });
}

/** Parse an integer query param ≥ `min` (default 1); anything else → undefined. */
function positiveInt(raw: string | null, min = 1): number | undefined {
  if (raw === null) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n >= min ? n : undefined;
}
