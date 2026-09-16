import {
  normalizeTurnMode,
  parseMentions,
  type TurnMode,
} from "@houston/protocol";
import { assistantRuntimeRole } from "../launcher/assistant-role";
import { stampTurnAttribution } from "./activity-attribution";
import type { TurnSeam } from "./agents-turn-seams";
import { liveTurns } from "./live-turn";
import { turnModeOf, turnPinOf } from "./turn-body";

/**
 * WHAT THE HOST RECORDS ABOUT A TURN it is about to forward: which conversation
 * the agent is working in, the mode that turn runs under, and who drove it.
 * Three facts the runtime is the wrong witness for, so the host takes them from
 * the request itself (routes/agents-turn-seams.ts runs them).
 */

/**
 * WHICH CONVERSATION THIS AGENT IS WORKING IN, recorded by the host rather than
 * taken from the runtime's word for it (routes/live-turn.ts): the mission depth
 * guard and the assistant's plan-mode gate are both about the runtime, so
 * neither may be answered by it. The mode is read only for the coordinator, the
 * one agent whose operations the host itself performs — every other agent's
 * send reaches the channel with its body untouched.
 *
 * WHO the turn acts as is recorded with it: the gateway-minted token this
 * request arrived with (undefined off the gateway, where an inbound acting
 * header is untrusted client input). The `/sandbox/*` routes this turn calls
 * back into read it from here rather than from their own request, which the
 * runtime writes and could name anyone in.
 *
 * The provider pair the send asked for is recorded too: a routine the agent
 * saves during this turn inherits it (routines-sandbox.ts). The body is the
 * shared memo (turn-body.ts), so reading it here costs nothing downstream and
 * the engine still receives the same bytes.
 */
export const recordLiveTurn: TurnSeam = async (ctx) => {
  if (ctx.turnConversationId === undefined) return;
  const body = await ctx.body.read();
  let mode: TurnMode = "execute";
  if (assistantRuntimeRole({ agentId: ctx.agent.id }))
    mode = normalizeTurnMode(turnModeOf(body));
  liveTurns.start(
    ctx.agent.id,
    ctx.turnConversationId,
    mode,
    { actingAs: ctx.actingAs },
    turnPinOf(body),
  );
};

/**
 * The Mode pill moved WHILE the assistant works (`POST …/mode`, the route the
 * runtime applies to its live turn): the host reads the same switch on its way
 * through, so its own plan gate cannot lag the runtime's.
 */
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

/**
 * Teams attribution: a user turn marks the acting human as a contributor on the
 * mission it drives, and records the teammates that message @mentioned
 * (HOU-945). Best-effort metadata that never blocks the turn (see
 * activity-attribution.ts); runs only when a gateway vouched for the actor, so
 * off the gateway nothing here runs, not even the body read, and
 * desktop/self-host activity.json stays identical.
 */
export const stampAttribution: TurnSeam = async (ctx) => {
  if (!ctx.actingAuthor || !ctx.vfs || ctx.turnConversationId === undefined)
    return;
  let mentionedIds: string[] = [];
  try {
    const parsed = JSON.parse(
      (await ctx.body.read()).toString("utf8") || "{}",
    ) as { mentions?: unknown };
    // The same shared guard the runtime and the cloud turn parser apply.
    mentionedIds = (parseMentions(parsed.mentions) ?? []).map((m) => m.userId);
  } catch {
    // An unparseable body carries no mentions to stamp, and deciding what to
    // tell the client is not this seam's business — the channel this request is
    // headed for answers it, and the two channels answer differently:
    // TurnChannel (cloudrun) parses the buffer and returns a clean 400
    // {error:"invalid JSON body"} (turn/dispatch.ts), while ProxyChannel
    // forwards the raw bytes to the agent's pi runtime, whose own body parse is
    // unguarded — that path answers the runtime's 500 {error:"internal error"},
    // relayed verbatim. Swallow here only because the request keeps travelling;
    // it never ends on a silent success.
  }
  await stampTurnAttribution(
    ctx.vfs,
    ctx.paths.agentRoot(ctx.workspace, ctx.agent),
    ctx.agent.id,
    ctx.turnConversationId,
    ctx.actingAuthor,
    mentionedIds,
    ctx.emit,
  );
};
