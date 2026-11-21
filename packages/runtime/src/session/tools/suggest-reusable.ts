import { defineTool } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { currentTurnFinish, recordSuggestReusable } from "../interaction";
import { unreadReplyInstruction } from "./unread-reply";

const SuggestReusableParams = Type.Object({
  reusableKind: Type.Union(
    [Type.Literal("skill"), Type.Literal("routine"), Type.Literal("learning")],
    {
      description:
        'What kind of reusable thing this work should be saved as. Use "skill" for a reusable procedure the user runs on demand, "routine" for work that should run automatically on a schedule, or "learning" for a stable fact or preference that emerged from this task and is worth remembering for future sessions.',
    },
  ),
  title: Type.String({
    description:
      'A short, plain-language name for the suggested Skill, Routine, or Learning, in the user\'s language. A few words at most (e.g. "Weekly sales summary").',
  }),
  rationale: Type.String({
    description:
      "One short sentence, in the user's language, explaining why saving this is useful: what it will save them next time. The user sees this on the card.",
  }),
});
type SuggestReusableParams = Static<typeof SuggestReusableParams>;

const ENDED_INSTRUCTION =
  "Your suggestion was recorded. The app shows the user a dismissible card offering to save this work, under the message you already wrote. This ended your turn.";

function needsMessageInstruction(visibleText: string): string {
  return `Your suggestion was recorded. The app will show the user a dismissible card offering to save this work. Do not repeat the suggestion in plain text and do not ask about it again. You called this before writing anything the user can read in this message, so this did NOT end your turn. Write your closing message now, then end, with any next-step offer in that same message. ${unreadReplyInstruction(visibleText)}`;
}

export function makeSuggestReusableTool() {
  return defineTool({
    name: "suggest_reusable",
    label: "Suggest saving as reusable",
    description: `Offer, on a dismissible card, to save the just-finished work as a reusable Skill, a scheduled Routine, or a Learning. Call it only when the work is clearly worth keeping (not a simple or one-off request), in your final message after your closing text, instead of asking in plain text or via ask_user. If you also offer next steps, make both offers in that same message. At most once per turn. It ends your turn, so put nothing after it.`,
    promptSnippet:
      "Suggest saving the completed work as a Skill, Routine, or Learning",
    parameters: SuggestReusableParams,
    executionMode: "sequential",
    async execute(_id: string, params: SuggestReusableParams) {
      const title = params.title?.trim();
      const rationale = params.rationale?.trim();
      if (!title) {
        throw new Error("suggest_reusable needs a non-empty title.");
      }
      if (!rationale) {
        throw new Error("suggest_reusable needs a non-empty rationale.");
      }
      recordSuggestReusable({
        reusableKind: params.reusableKind,
        title,
        rationale,
      });
      const details = { reusableKind: params.reusableKind, title, rationale };
      const finish = currentTurnFinish();
      if (!finish?.closingMessageSeen)
        return {
          content: [
            {
              type: "text" as const,
              text: needsMessageInstruction(finish?.visibleText ?? ""),
            },
          ],
          details,
        };
      finish.turnEndedByTool = true;
      return {
        content: [{ type: "text" as const, text: ENDED_INSTRUCTION }],
        details,
        terminate: true,
      };
    },
  });
}

export const SUGGEST_REUSABLE_TOOL_NAME = "suggest_reusable";
