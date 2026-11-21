import type { ManagerHandoff } from "../../stores/manager-handoff.ts";
import type { SupportedLocale } from "../locale.ts";
import { nextFreeAgentColor } from "../next-agent-color.ts";
import {
  type HandoffAbout,
  type HandoffEmployee,
  handoffPrompt,
} from "./handoff-prompt.ts";
import { encodeGoalCard } from "./onboarding-card-markers.ts";
import type { ManagerReach } from "./script-types.ts";

export interface GoalHandoffInput {
  goal: string | null;
  about: HandoffAbout;
  reach: ManagerReach | null;
  team: readonly HandoffEmployee[];
  colors: readonly (string | undefined)[];
  locale: SupportedLocale;
}

export function queueGoalHandoff(
  latch: { current: boolean },
  input: GoalHandoffInput,
  finish: (then?: () => void) => void,
  put: (handoff: ManagerHandoff) => void,
): void {
  if (latch.current) return;
  latch.current = true;
  if (input.goal === null || input.reach === null) {
    finish();
    return;
  }
  const { goal, about, team, colors, locale } = input;
  finish(() =>
    put({
      text: encodeGoalCard({ goal }),
      context: handoffPrompt({
        goal,
        about,
        team,
        freeColor: nextFreeAgentColor([...colors]),
        locale,
      }),
      grants: ["createAgent"],
    }),
  );
}

export function mayRetryGoal(
  goal: string,
  ownGoal: string | null | undefined,
): boolean {
  return typeof ownGoal === "string" && ownGoal !== "" && goal === ownGoal;
}
