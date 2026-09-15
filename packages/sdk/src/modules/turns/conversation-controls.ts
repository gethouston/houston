/**
 * The one-shot controls a surface applies to an EXISTING conversation: stop the
 * running turn, switch the mode it runs under, retire its pending interaction,
 * and cut the transcript for an edit-and-resend.
 *
 * Each is a single request against the agent's own runtime and answers exactly
 * what the runtime said — no stream, no VM fold, no refetch. Kept beside the
 * turn operations rather than inside them because those own the streaming
 * machinery and these own nothing, so a surface that drives the feed itself
 * (the web engine-adapter) binds these unchanged.
 */

import type { ModuleContext } from "../../module-context";
import {
  asConversationInput,
  asSetModeInput,
  asTruncateInput,
} from "./turn-inputs";

export function createConversationControls(ctx: ModuleContext) {
  /**
   * Stops whatever an agent is currently doing in one chat.
   *
   * `cancelled` reports whether a turn was ACTUALLY in flight: `false` means
   * there was nothing to abort (the turn died without settling), so no terminal
   * frame will follow and the caller settles its own stuck UI.
   * @param conversationId The chat to stop.
   * @param agentId The agent this acts on, by the id listAgents returns. An
   *   agent's name is not its id, so read the id from listAgents first.
   * @assistant group:chat unconfirmed: Stops work already under way; nothing already said or written is undone.
   */
  const cancel = (
    conversationId: string,
    agentId: string,
  ): Promise<{ ok: boolean; cancelled: boolean }> =>
    ctx.clientFor(agentId).cancel(conversationId);

  /**
   * Switches the mode the running turn acts under, mid-turn.
   *
   * The runtime mutates the executing turn's live-mode ref, so its tools adopt
   * the new mode at their next decision point. `applied: false` is benign — no
   * turn was running, and the next send pins the mode itself.
   * @param conversationId The chat whose running turn switches mode.
   * @param agentId The agent this acts on, by the id listAgents returns. An
   *   agent's name is not its id, so read the id from listAgents first.
   * @param mode "execute" (full read/write), "plan" (read-only plus a planning
   *   overlay) or "auto" (acts with everything except the blocking tools).
   * @assistant group:chat
   * @assistant hidden: it changes how the turn the person is watching behaves right now; the mode belongs to the chat they have open, not to a dispatched call.
   */
  const setMode = (
    conversationId: string,
    agentId: string,
    mode: "execute" | "plan" | "auto",
  ): Promise<{ ok: boolean; applied: boolean }> =>
    ctx.clientFor(agentId).setMode(conversationId, mode);

  /**
   * Retires the question a chat is waiting on, unanswered.
   *
   * The stepper's X / abandon: the runtime appends the durable stop marker,
   * which reads to the model exactly like a real Stop — it learns nothing from
   * the dismissal.
   * @param conversationId The chat whose pending question is retired.
   * @param agentId The agent this acts on, by the id listAgents returns. An
   *   agent's name is not its id, so read the id from listAgents first.
   * @assistant group:chat
   * @assistant hidden: it answers a card the person is looking at by abandoning it, and only they can decide that.
   */
  const dismissInteraction = (
    conversationId: string,
    agentId: string,
  ): Promise<{ ok: boolean }> =>
    ctx.clientFor(agentId).dismissInteraction(conversationId);

  /**
   * Cuts a chat's transcript at one of the person's own messages.
   *
   * The edit-and-resend rewind: the runtime drops that message and everything
   * after it (and resets the model's session so the next turn replays the kept
   * context); the caller follows up with a normal send carrying the edited
   * text. Answers 409 when a turn raced the edit — nothing was cut.
   * @param conversationId The chat to rewind.
   * @param agentId The agent this acts on, by the id listAgents returns. An
   *   agent's name is not its id, so read the id from listAgents first.
   * @param turnId The person's message to cut at; it and everything after go.
   * @assistant group:chat
   * @assistant hidden: it destroys the tail of a transcript to re-ask one message the person is editing in front of them, and nothing lists the turn ids it would need.
   */
  const truncate = (
    conversationId: string,
    agentId: string,
    turnId: string,
  ): Promise<{ ok: boolean; removed: number }> =>
    ctx.clientFor(agentId).truncateConversation(conversationId, turnId);

  ctx.registerCommand("turns/cancel", (payload) => {
    const ref = asConversationInput(payload, "turns/cancel");
    return cancel(ref.conversationId, ref.agentId);
  });
  ctx.registerCommand("turns/setMode", (payload) => {
    const input = asSetModeInput(payload);
    return setMode(input.conversationId, input.agentId, input.mode);
  });
  ctx.registerCommand("turns/dismissInteraction", (payload) => {
    const ref = asConversationInput(payload, "turns/dismissInteraction");
    return dismissInteraction(ref.conversationId, ref.agentId);
  });
  ctx.registerCommand("turns/truncate", (payload) => {
    const input = asTruncateInput(payload);
    return truncate(input.conversationId, input.agentId, input.turnId);
  });

  return { cancel, setMode, dismissInteraction, truncate };
}
