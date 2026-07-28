import { defineTool } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { recordPlanReady } from "../interaction";

/**
 * The plan-presentation tool — Plan mode ONLY. When the model has finished
 * planning it writes the full plan in its assistant message, then calls
 * `plan_ready` to ask what should happen next. Executing it records the single
 * plan-ready step of this turn's interaction sequence (carried on the terminal
 * `done` frame + the persisted assistant message), and Houston shows the user a
 * card with three choices — start working, hand it to Autopilot, or keep
 * planning — in place of the chat input. The model is still in Plan mode for THIS
 * turn (it cannot act), so it ends its turn right after; if the user chooses to
 * proceed, the app sends a NEW turn telling the model to begin.
 *
 * Gated to plan mode by name (`session/tool-selection.ts`): it never joins the
 * execute/auto base allowlist. It holds no credential and makes no network call.
 */

const PlanReadyParams = Type.Object({
  summary: Type.String({
    description:
      "One or two plain-language sentences in the user's language. The full plan must already be in your assistant message, where the user reads it. This is only the approval card's lede.",
  }),
});
type PlanReadyParams = Static<typeof PlanReadyParams>;

/** The instruction returned to the model after the plan step is recorded. */
const PLAN_READY_INSTRUCTION =
  "Your plan was presented to the user as a card with three choices: start working on it now, hand it to you to run on Autopilot, or keep planning together. You are still in Plan mode for THIS turn, so end your turn now without taking any action. If they choose to proceed, Houston will send you a message telling you to begin, and you will be able to act then. Do not repeat the plan or ask anything else in plain text.";

/** The plan-mode-only plan-presentation tool. */
export function makePlanReadyTool() {
  return defineTool({
    name: "plan_ready",
    label: "Present the plan",
    description:
      "After writing your full plan in the assistant message, present the next-step choice to the user. Pass a one- or two-sentence lede; Houston shows the user a card with three choices (start working, run on Autopilot, or keep planning). End your turn right after calling this.",
    promptSnippet:
      "Put the plan in your message, then present a one- or two-sentence summary",
    parameters: PlanReadyParams,
    executionMode: "sequential",
    async execute(_id: string, params: PlanReadyParams) {
      const summary = params.summary?.trim();
      if (!summary) {
        throw new Error("plan_ready needs a non-empty plan summary.");
      }
      recordPlanReady({ summary });
      return {
        content: [{ type: "text" as const, text: PLAN_READY_INSTRUCTION }],
        details: { summary },
      };
    },
  });
}

/** The tool name — pi's allowlist needs it alongside the object. */
export const PLAN_READY_TOOL_NAME = "plan_ready";
