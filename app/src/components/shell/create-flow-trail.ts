import {
  type CreateFlowShape,
  type CreateFlowStep,
  previousCreateFlowStep,
} from "./create-agent-steps-model.ts";

export type CreateFlowTrail = readonly CreateFlowStep[];

export const EMPTY_CREATE_FLOW_TRAIL: CreateFlowTrail = [];

const MAX_PARENT_HOPS = 7;

function stepExists(step: CreateFlowStep, shape: CreateFlowShape): boolean {
  if (step === "add") return shape.offersAdd;
  if (step === "choose") return shape.offersChoice || shape.first === "choose";
  return true;
}

function stepInShape(step: CreateFlowStep, shape: CreateFlowShape): boolean {
  if (shape.first === null) return false;
  let current = step;
  for (let hops = 0; hops < MAX_PARENT_HOPS; hops++) {
    if (!stepExists(current, shape)) return false;
    if (current === shape.first) return true;
    const parent = previousCreateFlowStep(current, shape);
    if (parent === current) return false;
    current = parent;
  }
  return false;
}

export function shapeOffersHire(shape: CreateFlowShape): boolean {
  return stepInShape("context", shape);
}

export function currentWalkedStep(
  trail: CreateFlowTrail,
  shape: CreateFlowShape,
): CreateFlowStep | null {
  return trail[trail.length - 1] ?? shape.first;
}

export function previousWalkedStep(
  trail: CreateFlowTrail,
): CreateFlowStep | null {
  return trail.length > 1 ? trail[trail.length - 2] : null;
}

export function walkToStep(
  trail: CreateFlowTrail,
  shape: CreateFlowShape,
  next: CreateFlowStep,
): CreateFlowTrail {
  const opened = shape.first === null ? EMPTY_CREATE_FLOW_TRAIL : [shape.first];
  const walked = trail.length > 0 ? trail : opened;
  const behind = walked.indexOf(next);
  return behind >= 0 ? walked.slice(0, behind + 1) : [...walked, next];
}

export interface ReconciledWalkedTrail {
  trail: CreateFlowTrail;
  dropped: CreateFlowTrail;
}

export function reconcileWalkedTrail(
  trail: CreateFlowTrail,
  shape: CreateFlowShape,
): ReconciledWalkedTrail {
  if (trail.length === 0) return { trail, dropped: EMPTY_CREATE_FLOW_TRAIL };
  const cut =
    trail[0] === shape.first
      ? trail.findIndex((step) => !stepInShape(step, shape))
      : 0;
  if (cut < 0) return { trail, dropped: EMPTY_CREATE_FLOW_TRAIL };
  return { trail: trail.slice(0, cut), dropped: trail.slice(cut) };
}
