import { normalizeTurnMode, parseMentions } from "@houston/protocol";
import { NextStepSuggestionsSchema } from "@houston/wire-types";
import { actingFromHeaders } from "../session/acting-context";
import { ensureProviderForTurn, runTurn } from "../session/chat";
import { parseConversationCommand } from "../session/conversation-command";
import {
  conversationCommandInFlight,
  holdConversationTurn,
} from "../session/conversation-command-gate";
import { isDraining } from "../session/drain";
import { parseMissionTitle } from "../session/mission-title";
import { startConversationCommand } from "./conversation-command-start";
import { engineUnavailable } from "./engine-unavailable";
import { json, type RouteContext, readJson } from "./http-helpers";
import {
  isRoutineFire,
  queuedCardAnswer,
  refuseNonCardOwner,
  sendAnswerer,
} from "./interaction-owner-gate";
import {
  acceptAdmission,
  admissionInput,
  releaseAdmission,
  replyExistingAdmission,
  trackAdmission,
} from "./message-admission";
import { noProviderRefusal } from "./no-provider-refusal";

/**
 * `POST /conversations/:id/messages` — the ONE door every channel's message
 * enters the runtime through (the desktop composer, a relayed WhatsApp or Slack
 * message, a routine firing). Everything that decides whether a message becomes
 * a turn lives here: the drain refusal, the conversation commands, the provider
 * gate, and the acting identity the turn runs as.
 */

export async function handleStartTurn(ctx: RouteContext, id: string) {
  // Shutting down: the turns already running finish, new ones do not start
  // here.
  if (isDraining()) {
    engineUnavailable(ctx, "the agent is restarting", 2);
    return;
  }
  const body = await readJson(ctx.req);
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
    missionTitle,
  } = body;
  if (!text || typeof text !== "string") {
    json(ctx.res, 400, { error: "missing 'text'" });
    return;
  }
  const suggestions = NextStepSuggestionsSchema.safeParse(
    body.nextStepSuggestions,
  );
  if (!suggestions.success) {
    json(ctx.res, 400, { error: "invalid nextStepSuggestions" });
    return;
  }
  const admission = admissionInput(ctx, body);
  if (admission === false || replyExistingAdmission(ctx, id, admission)) return;
  // While a card is live, only the person it is for may answer it, `/clear`
  // included. After the replay lookup (a retry of an admitted message starts
  // nothing and keeps its answer) and before any reservation; judged again
  // when a queued turn starts. A routine run is exempt.
  const answerer = sendAnswerer(ctx.req.headers);
  if (answerer && refuseNonCardOwner(ctx, id)) return;
  // CONVERSATION COMMANDS (`/clear`, `/compact`): an instruction to the
  // conversation, not a prompt for the agent. Intercepted HERE — ahead of the
  // provider gate below — so a `/clear` still works for someone whose provider
  // is disconnected, and so no command text can ever reach the model. Anything
  // else, `/unknown` included, falls through as an ordinary message.
  const command = parseConversationCommand(text);
  if (command) {
    startConversationCommand(
      ctx,
      id,
      command,
      text,
      typeof nonce === "string" ? nonce : undefined,
      admission,
    );
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
    json(ctx.res, 409, noProviderRefusal());
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
  const turnId = acceptAdmission(ctx, id, admission);
  if (turnId === false) return;
  // Held for the turn's whole life, so a command arriving mid-turn is refused
  // instead of tearing this turn's session down (conversation-command-gate.ts).
  holdConversationTurn(
    id,
    trackAdmission(
      id,
      admission,
      runTurn(
        id,
        text,
        typeof nonce === "string" ? nonce : undefined,
        {
          provider: pinnedProvider,
          model: pinnedModel,
          effort: typeof effort === "string" ? effort : undefined,
          mode: turnMode,
          nextStepSuggestions: suggestions.data,
        },
        acting,
        context,
        // Presentation-only bubble text (never trusted into the model input): the
        // model runs on `text`; this only changes what a history reload renders.
        typeof displayText === "string" ? displayText : undefined,
        // The @mention sidecar (HOU-944), sanitized before it is persisted or
        // published: junk entries are dropped and an empty list becomes nothing.
        parseMentions(mentions),
        turnId,
        // A new mission's first send: title its card after the reply, in this
        // same runtime (session/mission-title.ts). Malformed = no title.
        {
          missionTitle: parseMissionTitle(missionTitle),
          ...queuedCardAnswer(answerer, () => releaseAdmission(id, admission)),
          routineFire: isRoutineFire(ctx.req.headers),
        },
      ),
    ),
  );
  json(ctx.res, 202, { ok: true, id, ...(turnId ? { turnId } : {}) });
}
