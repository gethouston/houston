import {
  createAgentRoleContext,
  normalizeRolePart,
} from "../../../lib/agent-role-context.ts";
import type { AgentRoleState } from "../../shell/use-agent-role-state.ts";

export function hireCardRoleState(
  team: AgentRoleState,
  cardIndustry: string | null,
  onCardIndustry: (industry: string | null) => void,
): AgentRoleState {
  const contextLabel = cardIndustry ?? team.contextLabel;
  const fromQuestion =
    <Args extends unknown[]>(write: (...args: Args) => void) =>
    (...args: Args) => {
      onCardIndustry(null);
      write(...args);
    };

  return {
    ...team,
    contextLabel,
    brief: createAgentRoleContext({
      context: contextLabel,
      role: team.roleLabel,
    }),
    chooseContext: fromQuestion(team.chooseContext),
    chooseCustomContext: fromQuestion(team.chooseCustomContext),
    cancelCustomContext: fromQuestion(team.cancelCustomContext),
    writeCustomContext: fromQuestion(team.writeCustomContext),
    answerBrief: (field, answer) => {
      if (field === "role") {
        team.answerBrief(field, answer);
        return;
      }
      const industry = normalizeRolePart(answer);
      if (industry) onCardIndustry(industry);
    },
  };
}
