import { normalizeTurnMode, parseMentions } from "@houston/protocol";
import { actingFromHeaders } from "../session/acting-context";
import { ensureProviderForTurn, runTurn } from "../session/chat";
import { parseConversationCommand } from "../session/conversation-command";
import {
  conversationCommandBusy,
  conversationCommandInFlight,
  holdConversationTurn,
} from "../session/conversation-command-gate";
import { runConversationCommand } from "../session/conversation-command-run";
import { isDraining } from "../session/drain";
import { json, type RouteContext, readJson } from "./http-helpers";

/**
 * `POST /conversations/:id/messages` — the ONE door every channel's message
 * enters the runtime through (the desktop composer, a relayed WhatsApp or Slack
 * message, a routine firing). Everything that decides whether a message becomes
 * a turn lives here: the drain refusal, the conversation commands, the provider
 * gate, and the acting identity the turn runs as.
 */

/**
 * The engine's "not here, not now" answer — the gateway's waking shape, byte
 * for byte. Every shipped client reads `503 {"error":"engine unavailable"}` as
 * a state, not a failure: it re-sends the SAME message (same nonce, so a late
 * acceptance can never double it) along its wake ladder while the user's bubble
 * stays pending, and shows nothing. A new reason string would instead be a red
 * toast on every one of them.
 */
function engineUnavailable(
  ctx: RouteContext,
  detail: string,
  retryAfterSeconds: number,
): void {
  ctx.res.writeHead(503, {
    "Content-Type": "application/json; charset=utf-8",
    "Retry-After": String(retryAfterSeconds),
  });
  ctx.res.end(JSON.stringify({ error: "engine unavailable", detail }));
}

export async function handleStartTurn(ctx: RouteContext, id: string) {
  // Shutting down: the turns already running finish, new ones do not start
  // here.
  if (isDraining()) {
    engineUnavailable(ctx, "the agent is restarting", 2);
    return;
  }
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
  // CONVERSATION COMMANDS (`/clear`, `/compact`): an instruction to the
  // conversation, not a prompt for the agent. Intercepted HERE — ahead of the
  // provider gate below — so a `/clear` still works for someone whose provider
  // is disconnected, and so no command text can ever reach the model. Anything
  // else, `/unknown` included, falls through as an ordinary message.
  const command = parseConversationCommand(text);
  if (command) {
    // Same refusal as the edit-and-resend rewind: a command tears this
    // conversation's context down, which must never happen behind a turn the
    // user is waiting on. Clients hold sends while a turn runs, so a 409 here
    // means the caller raced one.
    if (conversationCommandBusy(id)) {
      json(ctx.res, 409, { error: "turn running" });
      return;
    }
    // Fire-and-forget like `runTurn`: the outcome (and a compaction can take a
    // model call's worth of seconds) arrives on the conversation's event
    // stream, never on this request. The command marks the conversation held
    // synchronously, so the refusal below is already true for the next send.
    void runConversationCommand(
      id,
      command,
      text,
      typeof nonce === "string" ? nonce : undefined,
    );
    json(ctx.res, 202, { ok: true, id });
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
  const pinnedModel = typeof model === "string" ? model : undefined;
  // The pin goes in so the turn's `[turn]` diagnostic names what this turn
  // really runs on, not the agent's saved provider (ai/turn-diagnostic.ts).
  if (
    !(await ensureProviderForTurn({
      provider: pinnedProvider,
      model: pinnedModel,
    })) &&
    !pinnedProvider
  ) {
    // `code` is the machine-readable half: the host's scheduler reads it to
    // demote a routine firing into this expected user state (nothing connected
    // yet) to a warning instead of a Sentry error (HOUSTON-APP-4XM).
    json(ctx.res, 409, {
      error: "No provider connected. Connect an AI provider first.",
      code: "no_provider",
    });
    return;
  }
  // A `/clear` or `/compact` is rewriting this conversation's context right
  // now: accepting a turn into it would run that turn against a session the
  // command is about to dispose, and leave its message on the wrong side of the
  // boundary marker. The waking shape is the honest answer — the message is not
  // lost, it simply cannot start yet, and the client re-sends it (unchanged,
  // same nonce) the moment the command settles. Checked in the same tick the
  // turn is accepted below, which is what makes the two decisions atomic.
  if (conversationCommandInFlight(id)) {
    engineUnavailable(ctx, "the conversation is running a command", 1);
    return;
  }
  // WHO is driving this turn (C2): the host forwards the gateway's acting-as
  // token, or (routine turns) the creator's sub. Captured here and held for the
  // turn so the integration tools act as that user. Both absent → act as owner.
  const acting = actingFromHeaders(ctx.req.headers);
  // Held for the turn's whole life, so a command arriving mid-turn is refused
  // instead of tearing this turn's session down (conversation-command-gate.ts).
  holdConversationTurn(
    id,
    runTurn(
      id,
      text,
      typeof nonce === "string" ? nonce : undefined,
      {
        provider: pinnedProvider,
        model: pinnedModel,
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
    ),
  );
  json(ctx.res, 202, { ok: true, id });
}
