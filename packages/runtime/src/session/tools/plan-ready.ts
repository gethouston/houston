import { defineTool } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { recordPlanReady } from "../interaction";

/**
 * The plan-presentation tool — Plan mode ONLY. When the model has finished
 * planning it calls `plan_ready` INSTEAD OF writing the plan out and asking the
 * user in plain text to approve or switch modes. Executing it records the single
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
      "A short, plain-language summary of the plan you are presenting for approval, in the user's language. A few sentences at most, the user already saw your full plan.",
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
      "Present your finished plan for the user to approve. Call this when you are done planning INSTEAD OF writing the plan out and asking in plain text. Pass a short summary; Houston shows the user a card with three choices (start working, run on Autopilot, or keep planning) in place of the chat input. End your turn right after calling this.",
    promptSnippet: "Present your finished plan for the user to approve",
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
