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

/**
 * Where the run stands, in the create sheet's header — or nothing at all, on
 * the screens that are not part of a run of several.
 *
 * The segmented bar belongs to the wide questions alone: the compact customize
 * screen is always the last of the three, so its bar would read fully filled
 * under the title and say nothing its employee card, which carries both
 * answers, does not already say. The copy
 * wizard counts its own screens, so it gets dots.
 *
 * Answering `undefined` rather than an empty node is load-bearing: the sheet's
 * header gives the middle slot to whatever stands there, and the title steps
 * back to the accessible name only when something does — which is also the
 * answer for a run the gates left with no screen to stand on.
 */
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
