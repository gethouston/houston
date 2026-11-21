import { nextTeamView } from "../../onboarding/team/team-view-model";
import { ContextStep } from "../../shell/context-step";
import type { RoleQuestionAnswer } from "../../shell/role-question";
import { ManagerQuestionStep } from "./manager-question-step";
import type { TeamCardProps } from "./manager-team-question-cards";

const answerValue = (answer: RoleQuestionAnswer<string>) =>
  answer.kind === "catalog" ? answer.id : answer.label;

export function BasicIndustryStep({
  team,
  view,
  onAnswer,
  onBack,
}: TeamCardProps) {
  const state = team.industryState;
  const { contextId } = state;
  const next = nextTeamView(view);
  const industry = (value: string) =>
    onAnswer({ question: "teamIndustry", value }, next);
  return (
    <ManagerQuestionStep
      id="team-basic-industry"
      onBack={onBack}
      onContinue={contextId === null ? null : () => industry(contextId)}
    >
      <ContextStep
        state={state}
        onAnswered={(answer) => industry(answerValue(answer))}
      />
    </ManagerQuestionStep>
  );
}
