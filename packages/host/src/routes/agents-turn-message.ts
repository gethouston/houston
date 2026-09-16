import { assistantApprovals } from "../assistant/approvals";
import type { TurnSeam } from "./agents-turn-seams";
import { guardTurnMessage } from "./turn-message-guard";

/**
 * WHETHER THE MESSAGE IS ADMITTED — the first thing that happens to a turn
 * POST, before the host records anything about it.
 *
 * The retry identity and the approval receipts are decided together because
 * they read the same bytes and answer the same question: is this the person's
 * own new message, a retry of one the runtime already took, or a request that
 * may not travel at all. Approvals are host-owned wherever the host runs, so
 * unlike the attribution seam this one runs off the gateway too.
 */
export const admitTurnMessage: TurnSeam = async (ctx) => {
  if (ctx.turnConversationId === undefined) return;
  const guard = await guardTurnMessage({
    approvals: assistantApprovals,
    vfs: ctx.vfs,
    dataRoot: ctx.paths.dataRoot(ctx.workspace, ctx.agent),
    agentId: ctx.agent.id,
    conversationId: ctx.turnConversationId,
    actor: ctx.actor,
    body: await ctx.body.read(),
  });
  if (guard.kind === "refused") {
    ctx.message.refusal = { status: guard.status, code: guard.code };
    return;
  }
  // The bytes the engine receives are the guard's: the request's `approvals`
  // field and any caller-authored retry fingerprint are gone by now.
  ctx.body.replace(guard.body);
  ctx.message.duplicate = guard.duplicate;
  if (guard.release) ctx.message.release = guard.release;
};
