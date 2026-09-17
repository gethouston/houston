import {
  type CreateFlowShape,
  type CreateFlowStep,
  previousCreateFlowStep,
} from "./create-agent-steps-model.ts";

/**
 * The screens the user has actually WALKED, in order, from the one the run
 * opened on to the one in hand.
 *
 * The create sheet's shape is not fixed for the length of a run: the
 * capabilities read is optimistic while it is in flight, so a user can walk
 * into the hire path a moment before the answer arrives that they may not
 * create agents at all, and the roster behind "Hire or copy?" settles just as
 * late. Two things follow, and both are this module's whole job. A screen the
 * new shape does not contain cannot be stood on, so the trail is cut back to
 * what survives. And Back reads the TRAIL rather than the shape in hand — the
 * way the user came, which is the only way back that cannot land them on a
 * screen they have never seen.
 */
export type CreateFlowTrail = readonly CreateFlowStep[];

/** A run that has not walked anywhere: it stands on the shape's first screen. */
export const EMPTY_CREATE_FLOW_TRAIL: CreateFlowTrail = [];

/** Every step, so a parent chain longer than this has to be a cycle. */
const MAX_PARENT_HOPS = 7;

/** Whether the run HAS this screen at all, before asking how it is reached.
 *  Both choice screens exist only when the shape says they were worth one. */
function stepExists(step: CreateFlowStep, shape: CreateFlowShape): boolean {
  if (step === "add") return shape.offersAdd;
  if (step === "choose") return shape.offersChoice || shape.first === "choose";
  return true;
}

/**
 * Is this screen part of the run THIS shape describes — reached from its first
 * screen by the way in, through screens that all exist? Climbing the parent
 * chain is what answers it: every hop is one level shallower, so the walk ends
 * at the first screen, at a screen the run does not have, or at the root of a
 * branch this run does not open.
 */
function stepInShape(step: CreateFlowStep, shape: CreateFlowShape): boolean {
  // A run with no screen to open on contains none of them.
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

/** Whether this run still offers the guided hire at all. The hire path's own
 *  state lives exactly as long as the path does: when the gates settle it away
 *  the answers gathered on it go with it. */
export function shapeOffersHire(shape: CreateFlowShape): boolean {
  return stepInShape("context", shape);
}

/** The screen in hand: the last one walked to, or the run's first — null when
 *  the run has no first screen, which is a sheet with nothing to stand on. */
export function currentWalkedStep(
  trail: CreateFlowTrail,
  shape: CreateFlowShape,
): CreateFlowStep | null {
  return trail[trail.length - 1] ?? shape.first;
}

/** The screen behind the one in hand, or null when there is nothing behind it
 *  — which is the sheet's way out rather than a step. */
export function previousWalkedStep(
  trail: CreateFlowTrail,
): CreateFlowStep | null {
  return trail.length > 1 ? trail[trail.length - 2] : null;
}

/**
 * The trail after a move. A screen already behind the user is a rewind, so the
 * trail unwinds to it rather than growing a second copy: the recap's "change
 * this answer" and the copy wizard's way out of its first screen both land on
 * a screen the user has seen, and Back from there must keep climbing.
 */
export function walkToStep(
  trail: CreateFlowTrail,
  shape: CreateFlowShape,
  next: CreateFlowStep,
): CreateFlowTrail {
  // A run with no first screen has none to record as the one left behind.
  const opened = shape.first === null ? EMPTY_CREATE_FLOW_TRAIL : [shape.first];
  const walked = trail.length > 0 ? trail : opened;
  const behind = walked.indexOf(next);
  return behind >= 0 ? walked.slice(0, behind + 1) : [...walked, next];
}

/** A trail measured against a shape that changed under it. */
export interface ReconciledWalkedTrail {
  /** What survives, unchanged (same value) when the whole trail does. */
  trail: CreateFlowTrail;
  /** The screens the new shape no longer has, in the order they were walked.
   *  What was answered on them is no longer part of this run. */
  dropped: CreateFlowTrail;
}

/**
 * The trail as the new shape allows it: everything up to the first screen the
 * run no longer contains. A trail that no longer even starts where the run now
 * opens is dropped whole — it belongs to a run that no longer exists, which is
 * also every trail once the gates leave the run with no first screen at all.
 */
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
