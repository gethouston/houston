import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { CopyAgentWizardState } from "../copy-agent/use-copy-agent-wizard";
import { ProgressDots } from "../portable/wizard-parts";
import {
  type CreateFlowStep,
  createFlowStepSize,
  GUIDED_CREATE_AGENT_STEPS,
  type GuidedCreateAgentStep,
  isGuidedCreateAgentStep,
} from "./create-agent-steps-model";
import { CreateStepProgress } from "./create-step-progress";

export function useCreateFlowProgress(
  step: CreateFlowStep | null,
  copy: CopyAgentWizardState,
): ReactNode {
  const { t } = useTranslation("agentOnboarding");
  if (step === null) return undefined;
  if (isGuidedCreateAgentStep(step) && createFlowStepSize(step) === "wide") {
    const labels = Object.fromEntries(
      GUIDED_CREATE_AGENT_STEPS.map((id) => [id, t(`roleSetup.steps.${id}`)]),
    ) as Record<GuidedCreateAgentStep, string>;
    return <CreateStepProgress step={step} labels={labels} />;
  }
  if (step === "copy") {
    return <ProgressDots index={copy.stepIndex} total={copy.steps.length} />;
  }
  return undefined;
}
