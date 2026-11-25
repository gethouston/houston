import { conversationTurnMode, loadActivities } from "@houston/domain";
import {
  normalizeTurnMode,
  parseMentions,
  parseTurnModePin,
  pushMissionTitle,
  type TurnMode,
} from "@houston/protocol";
import { assistantRuntimeRole } from "../launcher/assistant-role";
import { stampTurnAttribution } from "./activity-attribution";
import type { TurnSeam, TurnSeamCtx } from "./agents-turn-seams";
import { liveTurns } from "./live-turn";
import { turnLimitsOf, turnModeOf, turnPinOf } from "./turn-body";

// WHY: A retry the runtime already took records nothing, or mode and depth move onto a turn nobody sent. ADR-0016
export const recordLiveTurn: TurnSeam = async (ctx) => {
  if (ctx.turnConversationId === undefined || ctx.message.duplicate) return;
  const body = await ctx.body.read();
  let mode: TurnMode = "execute";
  if (assistantRuntimeRole({ agentId: ctx.agent.id }))
    mode =
      parseTurnModePin(turnModeOf(body)) ??
      (await keptConversationMode(ctx, ctx.turnConversationId)) ??
      "execute";
  liveTurns.start(
    ctx.agent.id,
    ctx.turnConversationId,
    mode,
    {
      actingAs: ctx.actingAs,
      limits: ctx.gatewayFronted ? turnLimitsOf(body) : undefined,
    },
    turnPinOf(body),
  );
};

async function keptConversationMode(
  ctx: TurnSeamCtx,
  conversationId: string,
): Promise<TurnMode | undefined> {
  if (!ctx.vfs) return undefined;
  try {
    const root = ctx.paths.agentRoot(ctx.workspace, ctx.agent);
    const { items } = await loadActivities(ctx.vfs, root);
    return conversationTurnMode(items, conversationId);
  } catch (error) {
    console.error("[turn] conversation mode: board unreadable", error);
    return undefined;
  }
}

export const applyModeSwitch: TurnSeam = async (ctx) => {
  const modeSwitch =
    ctx.method === "POST" && assistantRuntimeRole({ agentId: ctx.agent.id })
      ? ctx.rest.match(/^conversations\/([^/]+)\/mode$/)
      : null;
  if (!modeSwitch?.[1]) return;
  liveTurns.setMode(
    ctx.agent.id,
    decodeURIComponent(modeSwitch[1]),
    normalizeTurnMode(turnModeOf(await ctx.body.read())),
  );
};

export const stampAttribution: TurnSeam = async (ctx) => {
  if (!ctx.actingAuthor || !ctx.vfs || ctx.turnConversationId === undefined)
    return;
  if (ctx.message.duplicate) return;
  let mentionedIds: string[] = [];
  let eventKey: string | undefined;
  try {
    const parsed = JSON.parse(
      (await ctx.body.read()).toString("utf8") || "{}",
    ) as { mentions?: unknown; nonce?: unknown };
    mentionedIds = (parseMentions(parsed.mentions) ?? []).map((m) => m.userId);
    eventKey = typeof parsed.nonce === "string" ? parsed.nonce : undefined;
  } catch {}
  const activity = await stampTurnAttribution(
    ctx.vfs,
    ctx.paths.agentRoot(ctx.workspace, ctx.agent),
    ctx.agent.id,
    ctx.turnConversationId,
    ctx.actingAuthor,
    mentionedIds,
    ctx.emit,
  );
  if (
    activity &&
    mentionedIds.length &&
    eventKey &&
    ctx.actingAs &&
    ctx.pushReports
  ) {
    void ctx
      .pushReports(
        {
          v: 1,
          kind: "mentioned",
          conversation_id: ctx.turnConversationId,
          mission: { id: activity.id, title: pushMissionTitle(activity.title) },
          event_key: eventKey,
          user_ids: [...new Set(mentionedIds)].slice(0, 32),
        },
        ctx.actingAs,
      )
      .catch((error: unknown) =>
        console.error("[push] mention report failed", error),
      );
  }
};
