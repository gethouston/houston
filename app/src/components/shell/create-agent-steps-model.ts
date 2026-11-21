import type { CopyWizardStep } from "../copy-agent/copy-agent-wizard-model";

export type CreateFlowStep =
  | "add"
  | "choose"
  | "context"
  | "role"
  | "customize"
  | "copy"
  | "team";

export function hasFlowPrimary(
  step: CreateFlowStep,
  copyStep: CopyWizardStep,
): boolean {
  if (step === "customize" || step === "team") return true;
  return step === "copy" && copyStep !== "source";
}

export type CreateFlowSize = "compact" | "wide";

export function createFlowStepSize(step: CreateFlowStep): CreateFlowSize {
  return step === "context" || step === "role" || step === "copy"
    ? "wide"
    : "compact";
}

export const GUIDED_CREATE_AGENT_STEPS = [
  "context",
  "role",
  "customize",
] as const;

export type GuidedCreateAgentStep = (typeof GUIDED_CREATE_AGENT_STEPS)[number];

export type CreateFlowDoor = "choose" | "agent" | "team";

export interface CreateFlowGates {
  canCreateAgent: boolean;
  canCreateTeam: boolean;
  canCopy: boolean;
}

export interface CreateFlowShape {
  offersAdd: boolean;
  offersChoice: boolean;
  first: CreateFlowStep | null;
}

export function offersChoiceStep(gates: CreateFlowGates): boolean {
  return gates.canCopy;
}

export function createFlowShape(
  door: CreateFlowDoor,
  gates: CreateFlowGates,
): CreateFlowShape {
  const offersChoice = offersChoiceStep(gates);
  const offersAdd =
    door === "choose" && gates.canCreateAgent && gates.canCreateTeam;
  if (offersAdd) return { offersAdd, offersChoice, first: "add" };
  const agentFirst: CreateFlowStep = offersChoice ? "choose" : "context";
  const preferred: readonly CreateFlowStep[] =
    door === "team" ? ["team", agentFirst] : [agentFirst, "team"];
  const allowed = (step: CreateFlowStep) =>
    step === "team" ? gates.canCreateTeam : gates.canCreateAgent;
  return { offersAdd, offersChoice, first: preferred.find(allowed) ?? null };
}

export function isGuidedCreateAgentStep(
  step: CreateFlowStep,
): step is GuidedCreateAgentStep {
  return (GUIDED_CREATE_AGENT_STEPS as readonly CreateFlowStep[]).includes(
    step,
  );
}

export function guidedStepIndex(step: GuidedCreateAgentStep): number {
  return GUIDED_CREATE_AGENT_STEPS.indexOf(step);
}

export function nextCreateAgentStep(step: CreateFlowStep): CreateFlowStep {
  if (!isGuidedCreateAgentStep(step)) return step;
  const index = guidedStepIndex(step);
  return GUIDED_CREATE_AGENT_STEPS[index + 1] ?? step;
}

export function previousCreateFlowStep(
  step: CreateFlowStep,
  shape: CreateFlowShape,
): CreateFlowStep {
  if (step === shape.first) return step;
  if (step === "add") return step;
  if (step === "choose" || step === "team") {
    return shape.offersAdd ? "add" : step;
  }
  if (step === "copy") return "choose";
  const index = guidedStepIndex(step);
  if (index > 0) return GUIDED_CREATE_AGENT_STEPS[index - 1];
  if (shape.offersChoice) return "choose";
  return shape.offersAdd ? "add" : step;
}

export type CreateFlowStepDirection = "forward" | "back";

function stepDepth(step: CreateFlowStep): number {
  if (step === "add") return 0;
  if (step === "choose" || step === "team") return 1;
  if (step === "copy") return 2;
  return guidedStepIndex(step) + 2;
}

export function createFlowStepDirection(
  from: CreateFlowStep,
  to: CreateFlowStep,
): CreateFlowStepDirection {
  return stepDepth(to) < stepDepth(from) ? "back" : "forward";
}
