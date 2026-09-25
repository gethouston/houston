import { CopyAgentWizard } from "../copy-agent/copy-agent-wizard";
import type { CopyAgentWizardState } from "../copy-agent/use-copy-agent-wizard";
import { AddChoiceStep } from "./add-choice-step";
import { ChooseStartStep } from "./choose-start-step";
import { ContextStep } from "./context-step";
import type { CreateFlowStep } from "./create-agent-steps-model";
import { nextCreateAgentStep } from "./create-agent-steps-model";
import { COPY_AGENT_FORM_ID, CREATE_AGENT_FORM_ID } from "./create-flow-footer";
import { CreateTeamStep } from "./create-team-step";
import { CustomizeStep } from "./customize-step";
import { RoleStep } from "./role-step";
import type { CreateAgentFlow } from "./use-create-agent-flow";
import type { CreateTeamForm } from "./use-create-team-form";

/**
 * The screen the create sheet is standing on.
 *
 * Only the screen: the surface, the way back, the progress and the one action
 * are the sheet's own (`add-to-workspace-sheet.tsx`). Split out so the sheet
 * file stays what it is about — which frame each step wears and how the flow
 * walks between them — rather than a switch with a component in every arm.
 */
export function CreateFlowStepView({
  step,
  offersChoice,
  agent,
  copy,
  team,
  onGoToStep,
}: {
  step: CreateFlowStep;
  /** Whether "Hire or copy?" exists on this run. */
  offersChoice: boolean;
  agent: CreateAgentFlow;
  copy: CopyAgentWizardState;
  team: CreateTeamForm;
  onGoToStep: (next: CreateFlowStep) => void;
}) {
  if (step === "add") {
    return (
      <AddChoiceStep
        onAddAgent={() => onGoToStep(offersChoice ? "choose" : "context")}
        onAddTeam={() => onGoToStep("team")}
      />
    );
  }
  if (step === "choose") {
    return (
      <ChooseStartStep
        onHire={() => onGoToStep("context")}
        onCopy={() => onGoToStep("copy")}
      />
    );
  }
  if (step === "copy") {
    return <CopyAgentWizard w={copy} formId={COPY_AGENT_FORM_ID} />;
  }
  if (step === "team") return <CreateTeamStep form={team} />;
  if (step === "context") {
    return (
      <ContextStep
        state={agent.roleState}
        onAnswered={() => onGoToStep(nextCreateAgentStep(step))}
      />
    );
  }
  if (step === "role") {
    return (
      <RoleStep
        state={agent.roleState}
        onAnswered={() => onGoToStep(nextCreateAgentStep(step))}
      />
    );
  }
  return <CustomizeStep flow={agent} formId={CREATE_AGENT_FORM_ID} />;
}
