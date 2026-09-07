import { defineTool } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { currentTurnFinish, recordSuggestActions } from "../interaction";

/**
 * The follow-up-actions tool, available in execute AND auto after a mission
 * has finished. It records optional concrete next steps for the clean terminal
 * frame, which Houston renders as dismissible bubbles above the composer.
 *
 * The call ENDS the turn when the model has already written its closing
 * message: the reply and the bubbles then come from ONE model pass. Before
 * this, the result told the model "finish your final message normally", so
 * every clean turn paid a second model round-trip (a full context re-prefill)
 * whose only output was a filler closing line — the "Suggesting next steps"
 * spinner that hung under an already-complete reply, often followed by a
 * second message. pi honors the result's `terminate` hint directly (every
 * result in the batch must carry it — `suggest_reusable` does the same, so
 * the two offers may share the final message); the Claude backend mirrors it
 * with a PostToolBatch hook that reads the turn's ended mark
 * (backends/claude/turn-end-hook.ts).
 *
 * The guard: a model that calls this BEFORE writing anything visible in the
 * message carrying the call (its reply would be bubbles alone) gets the
 * non-ending result and is told to write its closing message, so a turn never
 * ends on bubbles without a reply.
 *
 * The call is mandatory on every turn that ends WITHOUT a blocking ask (the
 * product prompt requires it), yet the offer itself never blocks the user — it
 * rides the same terminal `done` frame as the blocking steps, but renders above
 * the composer instead of replacing it. It has no effect on the board status
 * (every settled turn lands `needs_you`; only the user moves a card to done).
 */
const SuggestActionsParams = Type.Object({
  actions: Type.Array(
    Type.Object({
      id: Type.String({
        description: "A stable short identifier for this action.",
      }),
      label: Type.String({
        description: "Short bubble text in the user's language, a few words.",
      }),
      message: Type.String({
        description:
          "The full follow-up message Houston sends when the user chooses this bubble.",
      }),
    }),
    { minItems: 2, maxItems: 4 },
  ),
});
type SuggestActionsParams = Static<typeof SuggestActionsParams>;

/** The result when the closing message is already written: the turn ends here. */
const ENDED_INSTRUCTION =
  "Your follow-up actions were recorded. Houston shows them as clickable bubbles above the composer, under the message you already wrote. This ended your turn.";

/** The result when the model called the tool before writing anything visible. */
const NEEDS_MESSAGE_INSTRUCTION =
  "Your follow-up actions were recorded. Houston will show them as clickable bubbles above the composer. You called this before writing anything the user can read, so this did NOT end your turn: write your short closing message now, then end. Do not repeat the actions in plain text or ask a closing question.";

/** Optional, concrete next steps for a mission that has already completed. */
export function makeSuggestActionsTool() {
  return defineTool({
    name: "suggest_actions",
    label: "Suggest follow-up actions",
    description:
      "Required on every turn you end without a blocking ask: after your closing message, offer 2 to 4 concrete, useful next steps grounded in the work you just did. This call ENDS your turn, so write the whole closing message first, in the same response, and put nothing after the call. Each label is short bubble text and each message is what Houston sends if the user clicks it. Use this instead of ending a completed mission with a filler ask_user question. Skip it only when the turn ends blocked on the user, meaning an ask_user question, a connection or credential request, or a plan waiting for approval. Call it at most once per turn, in the same final message as suggest_reusable if you offer one.",
    promptSnippet: "Offer concrete follow-up actions for the completed work",
    parameters: SuggestActionsParams,
    executionMode: "sequential",
    async execute(_id: string, params: SuggestActionsParams) {
      const actions = params.actions;
      if (
        actions.some(
          (action) =>
            !action.id.trim() || !action.label.trim() || !action.message.trim(),
        )
      )
        throw new Error(
          "suggest_actions needs non-empty ids, labels, and messages.",
        );
      if (
        new Set(actions.map((action) => action.id.trim())).size !==
        actions.length
      )
        throw new Error("suggest_actions needs unique action ids.");
      recordSuggestActions({ actions });
      const finish = currentTurnFinish();
      if (!finish?.closingMessageSeen)
        return {
          content: [{ type: "text" as const, text: NEEDS_MESSAGE_INSTRUCTION }],
          details: { actions },
        };
      finish.turnEndedByTool = true;
      return {
        content: [{ type: "text" as const, text: ENDED_INSTRUCTION }],
        details: { actions },
        // pi's early-termination hint: the loop stops after this tool batch
        // instead of calling the model again. Every result in the batch must
        // set it; a sibling that does not simply costs one more round-trip.
        terminate: true,
      };
    },
  });
}

export const SUGGEST_ACTIONS_TOOL_NAME = "suggest_actions";
