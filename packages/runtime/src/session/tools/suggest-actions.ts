import { defineTool } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { Value } from "typebox/value";
import { currentTurnFinish, recordSuggestActions } from "../interaction";
import { unreadReplyInstruction } from "./unread-reply";

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
          "The full follow-up message sent when the user chooses this bubble.",
      }),
    }),
    { minItems: 2, maxItems: 4 },
  ),
});
type SuggestActionsParams = Static<typeof SuggestActionsParams>;
type SuggestedAction = SuggestActionsParams["actions"][number];

export function suggestActionsProblem(
  actions: readonly SuggestedAction[],
): string | null {
  if (
    actions.some(
      (action) =>
        !action.id.trim() || !action.label.trim() || !action.message.trim(),
    )
  )
    return "suggest_actions needs non-empty ids, labels, and messages.";
  if (
    new Set(actions.map((action) => action.id.trim())).size !== actions.length
  )
    return "suggest_actions needs unique action ids.";
  return null;
}

export function parseSuggestedActions(args: unknown): SuggestedAction[] | null {
  if (!Value.Check(SuggestActionsParams, args)) return null;
  return suggestActionsProblem(args.actions) ? null : args.actions;
}

const ENDED_INSTRUCTION =
  "Your follow-up actions were recorded. The app shows them as clickable bubbles above the composer, under the message you already wrote. This ended your turn.";

function needsMessageInstruction(visibleText: string): string {
  return `Your follow-up actions were recorded. The app will show them as clickable bubbles above the composer. You called this before writing anything the user can read in this message, so this did NOT end your turn. Write your closing message now, then end. ${unreadReplyInstruction(visibleText)} Do not repeat the actions in plain text or ask a closing question.`;
}

export function makeSuggestActionsTool() {
  return defineTool({
    name: "suggest_actions",
    label: "Suggest follow-up actions",
    description:
      "Required on every turn you end without a blocking ask: after your closing message, offer 2 to 4 concrete, useful next steps grounded in the work you just did. This call ENDS your turn, so write the whole closing message first, in the same response, and put nothing after the call. The user never sees your reasoning or tool results: anything they should read, such as a draft you prepared, must be in your visible text. Each label is short bubble text and each message is what gets sent if the user clicks it. Use this instead of ending a completed mission with a filler ask_user question. Skip it only when the turn ends blocked on the user, meaning an ask_user question, a connection or credential request, or a plan waiting for approval. Call it at most once per turn, in the same final message as suggest_reusable if you offer one.",
    promptSnippet: "Offer concrete follow-up actions for the completed work",
    parameters: SuggestActionsParams,
    executionMode: "sequential",
    async execute(_id: string, params: SuggestActionsParams) {
      const actions = params.actions;
      const problem = suggestActionsProblem(actions);
      if (problem) throw new Error(problem);
      recordSuggestActions({ actions });
      const finish = currentTurnFinish();
      if (!finish?.closingMessageSeen)
        return {
          content: [
            {
              type: "text" as const,
              text: needsMessageInstruction(finish?.visibleText ?? ""),
            },
          ],
          details: { actions },
        };
      finish.turnEndedByTool = true;
      return {
        content: [{ type: "text" as const, text: ENDED_INSTRUCTION }],
        details: { actions },
        terminate: true,
      };
    },
  });
}

export const SUGGEST_ACTIONS_TOOL_NAME = "suggest_actions";
