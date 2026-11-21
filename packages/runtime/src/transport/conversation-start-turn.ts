import { parseMentions, parseTurnModePin } from "@houston/protocol";
import {
  NextStepSuggestionsSchema,
  TurnTimezoneSchema,
} from "@houston/wire-types";
import { config } from "../config";
import { actingFromHeaders } from "../session/acting-context";
import { ensureProviderForTurn, runTurn } from "../session/chat";
import { parseConversationCommand } from "../session/conversation-command";
import {
  conversationCommandInFlight,
  holdConversationTurn,
} from "../session/conversation-command-gate";
import { storedConversationMode } from "../session/conversation-mode";
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

export async function handleStartTurn(ctx: RouteContext, id: string) {
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
  const timezone = TurnTimezoneSchema.safeParse(body.timezone);
  if (!timezone.success) {
    json(ctx.res, 400, { error: "invalid timezone" });
    return;
  }
  const admission = admissionInput(ctx, body);
  if (admission === false || replyExistingAdmission(ctx, id, admission)) return;
  const answerer = sendAnswerer(ctx.req.headers);
  if (answerer && refuseNonCardOwner(ctx, id)) return;
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
  const turnMode =
    parseTurnModePin(mode) ??
    (await storedConversationMode(config.workspaceDir, id));
  const context =
    typeof workspaceContext === "string" || typeof userContext === "string"
      ? {
          workspace:
            typeof workspaceContext === "string" ? workspaceContext : "",
          user: typeof userContext === "string" ? userContext : "",
        }
      : undefined;
  const pinnedProvider =
    typeof provider === "string" && provider ? provider : undefined;
  const pinnedModel = typeof model === "string" ? model : undefined;
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
  if (conversationCommandInFlight(id)) {
    engineUnavailable(ctx, "the conversation is running a command", 1);
    return;
  }
  const acting = actingFromHeaders(ctx.req.headers);
  const turnId = acceptAdmission(ctx, id, admission);
  if (turnId === false) return;
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
          timezone: timezone.data,
        },
        acting,
        context,
        typeof displayText === "string" ? displayText : undefined,
        parseMentions(mentions),
        turnId,
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
