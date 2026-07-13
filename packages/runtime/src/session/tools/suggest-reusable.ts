import { defineTool } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { recordSuggestReusable } from "../interaction";

/**
 * The reusable-suggestion tool — the model's end-of-task REFLECTION STEP,
 * available in execute AND auto. When the model has FINISHED a task whose work
 * is clearly worth keeping (genuinely reusable, multi-step work, or a stable
 * fact worth remembering), it calls `suggest_reusable` right before its final message
 * INSTEAD OF asking the user about it in plain text or via `ask_user`. Executing
 * it records the single suggest-reusable step of this turn's interaction sequence
 * (carried on the terminal `done` frame + the persisted assistant message), and
 * Houston shows the user a dismissible card offering to save the work as a Skill,
 * a scheduled Routine, or a Learning the agent remembers for future sessions.
 *
 * CRITICALLY, this is NOT a turn-ending block like `plan_ready`: the task is
 * genuinely DONE, so the model wraps up its final message to the user as usual.
 * The suggestion is an optional offer, never something blocking completion — a
 * LONE `suggest_reusable` step keeps the mission on `done`, not `needs_you` (see
 * `interaction.ts`'s fallback-only precedence and `turn-settle.ts`'s `finishOk`).
 *
 * It holds no credential and makes no network call, and it is name-gated OUT of
 * plan mode by `session/tool-selection.ts` (plan is read-only planning, not a
 * finished task). It reaches execute and auto because it never blocks the turn.
 */

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

/** The instruction returned to the model after the suggestion is recorded. */
const SUGGEST_REUSABLE_INSTRUCTION =
  "Your suggestion was recorded. Houston will show the user a dismissible card offering to save this work. Do not repeat the suggestion in plain text and do not ask about it again. This did NOT end your turn. The task is done, so finish your final message to the user normally.";

/** The reusable-suggestion tool (execute + auto; never plan). */
export function makeSuggestReusableTool() {
  return defineTool({
    name: "suggest_reusable",
    label: "Suggest saving as reusable",
    description:
      "Suggest saving the just-completed work as a reusable Skill, a scheduled Routine, or a Learning to remember. Call this when you finish a task and the work is clearly worth keeping (a genuinely reusable multi-step procedure, work that should recur on a schedule, or a stable fact worth remembering — not a simple or one-off request), right before your final message, INSTEAD OF asking about it in plain text or via ask_user. Houston shows the user a dismissible card offering to save it. Call it at most once per turn, and still finish your final message normally. This does not end your turn.",
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
      return {
        content: [
          { type: "text" as const, text: SUGGEST_REUSABLE_INSTRUCTION },
        ],
        details: { reusableKind: params.reusableKind, title, rationale },
      };
    },
  });
}

/** The tool name — pi's allowlist needs it alongside the object. */
export const SUGGEST_REUSABLE_TOOL_NAME = "suggest_reusable";
