import { assistantApprovals } from "../assistant/approvals";
import type { TurnSeam } from "./agents-turn-seams";
import { guardTurnMessage } from "./turn-message-guard";

export const admitTurnMessage: TurnSeam = async (ctx) => {
  if (ctx.turnConversationId === undefined) return;
  const guard = await guardTurnMessage({
    approvals: assistantApprovals,
    vfs: ctx.vfs,
    dataRoot: ctx.paths.dataRoot(ctx.workspace, ctx.agent),
    agentId: ctx.agent.id,
    conversationId: ctx.turnConversationId,
    actor: ctx.actor,
    grantActor: ctx.actingAs,
    body: await ctx.body.read(),
  });
  if (guard.kind === "refused") {
    ctx.message.refusal = { status: guard.status, code: guard.code };
    return;
  }
  ctx.body.replace(guard.body);
  ctx.message.duplicate = guard.duplicate;
  if (guard.release) ctx.message.release = guard.release;
};
