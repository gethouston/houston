import type { CopyWizardStep } from "../copy-agent/copy-agent-wizard-model";

/**
 * The step machine behind the ONE create sheet.
 *
 * Everything a user may ADD to their workspace is the same flow: it opens on
 * "What do you want to add?" and every answer is another step of the same
 * sheet. An AI employee is either hired — the three-question guided setup, the
 * industry it works in, the job it fills, then its name and colour — or copied
 * from one the user already has, which is the copy wizard owning its own inner
 * steps. A team is one form, answered in place.
 *
 * Every screen the run does not need is skipped rather than shown empty: a
 * caller who may create only one of the two never meets the opening choice,
 * and a user with nothing to copy never meets the hire/copy choice.
 */
export type CreateFlowStep =
  | "add"
  | "choose"
  | "context"
  | "role"
  | "customize"
  | "copy"
  | "team";

/**
 * Whether the screen in hand HAS a primary action at all. The two choice
 * screens and the copy wizard's source list are answered by pressing one of
 * the things on offer, so a bar under them would be a second way to say the
 * same thing, greyed out until it is not — and the sheet leaves the bar out
 * entirely rather than pin an empty bordered strip to the bottom of the flow.
 */
export function hasFlowPrimary(
  step: CreateFlowStep,
  copyStep: CopyWizardStep,
): boolean {
  if (step === "customize" || step === "team") return true;
  return step === "copy" && copyStep !== "source";
}

/**
 * How much room a step needs, in the sheet's own two sizes
 * (`FlowSheetSize`, @houston-ai/core). Spelled locally rather than imported so
 * the model stays a plain module the step tests can load on their own.
 */
export type CreateFlowSize = "compact" | "wide";

/**
 * The frame each screen wears.
 *
 * Only the two catalog questions and the copy wizard are scanning work — long
 * runs of chips, a list of the user's own agents — and those take the tall
 * frame. Everything else asks ONE short thing: two cards, a team's name, a
 * name and a colour. Those wear the confirm dialog's hand-sized surface, where
 * the question fills the dialog instead of floating in it.
 */
export function createFlowStepSize(step: CreateFlowStep): CreateFlowSize {
  return step === "context" || step === "role" || step === "copy"
    ? "wide"
    : "compact";
}

/** The guided setup, in order. The progress indicator renders exactly this. */
export const GUIDED_CREATE_AGENT_STEPS = [
  "context",
  "role",
  "customize",
] as const;

export type GuidedCreateAgentStep = (typeof GUIDED_CREATE_AGENT_STEPS)[number];

/**
 * Which door a caller opened the sheet by. `"choose"` is the rail's "+", which
 * knows only that the user wants to add something; the other two are the
 * callers that already know (the list's "New AI Employee" and "New group"),
 * and they land on that path's own first screen.
 */
export type CreateFlowDoor = "choose" | "agent" | "team";

/** What this caller is allowed to make, and what there is to make it from. */
export interface CreateFlowGates {
  canCreateAgent: boolean;
  canCreateTeam: boolean;
  /** The user owns at least one agent whose content they may copy. */
  canCopy: boolean;
}

/** The screens THIS run has, and the one it stands on when it opens. */
export interface CreateFlowShape {
  /** "What do you want to add?" — only when both answers exist. */
  offersAdd: boolean;
  /** "Hire or copy?" — only when there is something to copy. */
  offersChoice: boolean;
  /** Where the run opens — null when it has no screens at all. */
  first: CreateFlowStep | null;
}

/** Whether the sheet asks which way to get an agent. Worth a screen only to a
 *  user who HAS one to copy. */
export function offersChoiceStep(gates: CreateFlowGates): boolean {
  return gates.canCopy;
}

/**
 * The shape of one run: which of the two choice screens it contains, and where
 * it opens. A choice with one answer is a click spent on nothing, so it is not
 * a screen — the sheet opens on what that answer leads to.
 *
 * A door says what the caller MEANT, never what this user may do: the gates
 * settle after the sheet is open (`create-flow-trail.ts`), so a door onto a
 * path they closed falls to the other, and closing both leaves no screen.
 */
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

/**
 * The step an answered question leads to. The last guided step submits rather
 * than advancing, and the choices, the copy wizard and the team form are
 * answered by their own controls, so they all stay put.
 */
export function nextCreateAgentStep(step: CreateFlowStep): CreateFlowStep {
  if (!isGuidedCreateAgentStep(step)) return step;
  const index = guidedStepIndex(step);
  return GUIDED_CREATE_AGENT_STEPS[index + 1] ?? step;
}

/**
 * Back goes up ONE level of the same tree: a guided question to the one before
 * it, the first question and the copy wizard to the choice that opened them,
 * and either path's first screen to "What do you want to add?". The screen the
 * run opened on has nothing behind it — it comes back unchanged, and the sheet
 * reads that as the way out.
 */
export function previousCreateFlowStep(
  step: CreateFlowStep,
  shape: CreateFlowShape,
): CreateFlowStep {
  if (step === shape.first) return step;
  if (step === "add") return step;
  if (step === "choose" || step === "team") {
    return shape.offersAdd ? "add" : step;
  }
  // The copy wizard is reachable from the hire/copy choice alone.
  if (step === "copy") return "choose";
  const index = guidedStepIndex(step);
  if (index > 0) return GUIDED_CREATE_AGENT_STEPS[index - 1];
  if (shape.offersChoice) return "choose";
  return shape.offersAdd ? "add" : step;
}

/** Which way a move travels. The incoming screen enters from that side, so
 *  going back visibly rewinds rather than replaying the way in. */
export type CreateFlowStepDirection = "forward" | "back";

/** How deep a screen sits in the tree. The two paths off the opening choice
 *  hang at the same depth, and so do both doors off the hire/copy choice. */
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
