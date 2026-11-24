import type { ModuleContext } from "../../module-context";
import { refusalCode, refusalStatus } from "../refusal-code";
import { createConversationImports } from "./conversation-imports";
import { createConversationPrewarm } from "./conversation-prewarm";
import { type StreamRegistry, streamKey } from "./stream-registry";
import {
  asConversationInput,
  asSetModeInput,
  asTruncateInput,
} from "./turn-inputs";
import { isTurnRunningRejection } from "./turn-running";

/**
 * What a dismiss came to. `turn_running`: the runtime refused because a turn
 * is accepted, queued or running on the chat, so the card the caller showed was
 * already retired by that turn. The caller catches its view up to the running
 * turn (the interaction is gone either way) and must NOT clear a persisted
 * copy of the card, which would race the running turn's own settle write.
 * `not_interaction_owner`: on a shared agent the card is for the member whose
 * message raised it, and only they may dismiss it (403). Nothing changed; the
 * card stays for its person.
 */
export type DismissInteractionOutcome =
  | { ok: true }
  | { ok: false; refusal: "turn_running" | "not_interaction_owner" };

function isNotInteractionOwnerRefusal(err: unknown): boolean {
  return (
    err instanceof Error &&
    refusalStatus(err) === 403 &&
    refusalCode(err) === "not_interaction_owner"
  );
}

export function createConversationControls(
  ctx: ModuleContext,
  registry: StreamRegistry,
) {
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

  const stopUnsent = (
    conversationId: string,
    agentId: string,
  ): (() => void) | null =>
    registry.stopUnsent(streamKey(agentId, conversationId));

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
   * the dismissal. Answers `{ ok: false, refusal: "turn_running" }` instead of
   * throwing when a turn raced the dismiss: that turn already retired the
   * question, the caller's view was stale, and nothing is wrong. Answers
   * `{ ok: false, refusal: "not_interaction_owner" }` when the card belongs to
   * another member of a shared agent.
   * @param conversationId The chat whose pending question is retired.
   * @param agentId The agent this acts on, by the id listAgents returns. An
   *   agent's name is not its id, so read the id from listAgents first.
   * @assistant group:chat
   * @assistant hidden: it answers a card the person is looking at by abandoning it, and only they can decide that.
   */
  const dismissInteraction = async (
    conversationId: string,
    agentId: string,
  ): Promise<DismissInteractionOutcome> => {
    try {
      await ctx.clientFor(agentId).dismissInteraction(conversationId);
      return { ok: true };
    } catch (err) {
      if (isTurnRunningRejection(err))
        return { ok: false, refusal: "turn_running" };
      if (isNotInteractionOwnerRefusal(err))
        return { ok: false, refusal: "not_interaction_owner" };
      throw err;
    }
  };

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

  const stopAndCancel = async (conversationId: string, agentId: string) => {
    const finish = stopUnsent(conversationId, agentId);
    try {
      return await cancel(conversationId, agentId);
    } finally {
      finish?.();
    }
  };
  ctx.registerCommand("turns/cancel", (payload) => {
    const ref = asConversationInput(payload, "turns/cancel");
    return stopAndCancel(ref.conversationId, ref.agentId);
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

  return {
    cancel,
    stopUnsent,
    setMode,
    dismissInteraction,
    truncate,
    ...createConversationImports(ctx),
    ...createConversationPrewarm(ctx),
  };
}
