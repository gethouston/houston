import { defineTool } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { recordSuggestActions } from "../interaction";

/**
 * The follow-up-actions tool, available in execute AND auto after a mission
 * has finished. It records optional concrete next steps for the clean terminal
 * frame, which Houston renders as dismissible bubbles above the composer.
 *
 * This is NOT a turn-ending block like `plan_ready`: the mission is already
 * done, so the model still finishes its final message normally. The offer is
 * optional and never changes the board from `done` to `needs_you`.
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

const INSTRUCTION =
  "Your follow-up actions were recorded. Houston will show them as clickable bubbles above the composer. Do not repeat them in plain text or ask a closing question. This did NOT end your turn. The task is done, so finish your final message normally.";

/** Optional, concrete next steps for a mission that has already completed. */
export function makeSuggestActionsTool() {
  return defineTool({
    name: "suggest_actions",
    label: "Suggest follow-up actions",
    description:
      "After completing a mission, offer 2 to 4 concrete, useful next steps grounded in the work you just did. Each label is short bubble text and each message is what Houston sends if the user clicks it. Use this instead of ending a completed mission with a filler ask_user question. Do not use it for blocking questions, and omit it when no genuinely useful follow-up exists. Call it at most once per turn, then finish normally.",
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
      return {
        content: [{ type: "text" as const, text: INSTRUCTION }],
        details: { actions },
      };
    },
  });
}

export const SUGGEST_ACTIONS_TOOL_NAME = "suggest_actions";
