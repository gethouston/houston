import { useState } from "react";
import type {
  AgentContextId,
  AgentRoleId,
} from "../../../lib/agent-role-catalog";
import type { LeadershipRoleId } from "../../../lib/leadership-roles";
import type { OnboardingRoleId } from "../../../lib/onboarding-survey";
import { ContextStep } from "../../shell/context-step";
import type { RoleQuestionAnswer } from "../../shell/role-question";
import { RoleStep } from "../../shell/role-step";
import {
  type AgentRoleStart,
  useAgentRoleState,
} from "../../shell/use-agent-role-state";
import { ManagerQuestionStep } from "./manager-question-step";

export type AboutQuestion = "industry" | "role";

export function ManagerAboutStep({
  question,
  start,
  leadershipStart,
  busy,
  error,
  onIndustry,
  onRole,
  onDecline,
  onBack,
}: {
  question: AboutQuestion;
  start: AgentRoleStart;
  leadershipStart: LeadershipRoleId | null;
  busy: boolean;
  error: string | null;
  onIndustry: (answer: RoleQuestionAnswer<AgentContextId>) => void;
  onRole: (answer: RoleQuestionAnswer<OnboardingRoleId>) => void;
  onDecline?: () => void;
  onBack?: (() => void) | null;
}) {
  const state = useAgentRoleState(true, start);
  const [leadershipId, setLeadershipId] = useState(leadershipStart);
  const { contextId, roleId } = state;
  const answerJob = (answer: RoleQuestionAnswer<AgentRoleId>) => {
    setLeadershipId(null);
    onRole(answer);
  };
  const answerPosition = (id: LeadershipRoleId) => {
    setLeadershipId(id);
    onRole({ kind: "catalog", id });
  };
  const heldAnswer = (): (() => void) | null => {
    if (question === "industry")
      return contextId === null
        ? null
        : () => onIndustry({ kind: "catalog", id: contextId });
    if (roleId !== null) return () => onRole({ kind: "catalog", id: roleId });
    return leadershipId === null || state.roleIsCustom
      ? null
      : () => onRole({ kind: "catalog", id: leadershipId });
  };

  return (
    <ManagerQuestionStep
      id={`survey-${question}`}
      busy={busy}
      error={error}
      onContinue={heldAnswer()}
      onDecline={onDecline}
      onBack={onBack}
    >
      {question === "industry" ? (
        <ContextStep state={state} audience="self" onAnswered={onIndustry} />
      ) : (
        <RoleStep
          state={state}
          audience="self"
          leadership={{ selectedId: leadershipId, onSelect: answerPosition }}
          onAnswered={answerJob}
        />
      )}
    </ManagerQuestionStep>
  );
}
