import { defineTool } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";
import { recordPlanReady } from "../interaction";

const PlanReadyParams = Type.Object({
  summary: Type.String({
    description:
      "One or two plain-language sentences in the user's language. The full plan must already be in your assistant message, where the user reads it. This is only the approval card's lede.",
  }),
});
type PlanReadyParams = Static<typeof PlanReadyParams>;

const PLAN_READY_INSTRUCTION =
  "Your plan was presented to the user as a card with three choices: start working on it now, hand it to you to run on Autopilot, or keep planning together. You are still in Plan mode for THIS turn, so end your turn now without taking any action. If they choose to proceed, you will get a message telling you to begin, and you will be able to act then. Do not repeat the plan or ask anything else in plain text.";

export function makePlanReadyTool() {
  return defineTool({
    name: "plan_ready",
    label: "Present the plan",
    description:
      "After writing your full plan in the assistant message, present the next-step choice to the user. Pass a one- or two-sentence lede; the app shows the user a card with three choices (start working, run on Autopilot, or keep planning). End your turn right after calling this.",
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

export const PLAN_READY_TOOL_NAME = "plan_ready";
