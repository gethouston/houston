// `.ts` extensions so the node test runner can load this module on its own.
import {
  createAgentRoleContext,
  normalizeRolePart,
} from "../../../lib/agent-role-context.ts";
import type { AgentRoleState } from "../../shell/use-agent-role-state.ts";

/**
 * A hire's answers as its naming card reads and writes them.
 *
 * `team` holds the answers the questions give, and its industry is the
 * team's: it is where the next hire and the basic team start. An industry
 * answered again on the card is this hire's alone (`cardIndustry`), so it is
 * kept beside the team's and never written into it. An answer in the industry
 * question is the team's again and drops the card's own.
 *
 * The job needs no split: every hire answers its own, and the next one starts
 * without it (`clearRole`).
 */
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
