import { FlowSheet } from "@houston-ai/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUIStore } from "../../stores/ui";
import { useCopyAgentWizard } from "../copy-agent/use-copy-agent-wizard";
import {
  type CreateFlowStep,
  type CreateFlowStepDirection,
  createFlowShape,
  createFlowStepDirection,
  createFlowStepSize,
  hasFlowPrimary,
} from "./create-agent-steps-model";
import { CreateFlowFooter } from "./create-flow-footer";
import { useCreateFlowProgress } from "./create-flow-progress";
import { CreateFlowStepView } from "./create-flow-step-view";
import { useCreateFlowTitle } from "./create-flow-title";
import {
  type CreateFlowTrail,
  currentWalkedStep,
  EMPTY_CREATE_FLOW_TRAIL,
  previousWalkedStep,
  reconcileWalkedTrail,
  shapeOffersHire,
  walkToStep,
} from "./create-flow-trail";
import { useCreateAgentFlow } from "./use-create-agent-flow";
import { useCreateFlowGates } from "./use-create-flow-gates";
import { useCreateTeamForm } from "./use-create-team-form";

/**
 * The ONE surface for everything a user adds to their workspace.
 *
 * Every door — the rail's "+", a team's empty board, the AI Employees list's
 * create buttons — opens this same sheet; what differs is only the screen it
 * opens ON. "What do you want to add?" leads to an AI employee (hired through
 * the guided brief, or copied from one the user already has) or to a team,
 * and each of those is another step of the SAME frame.
 *
 * The frame comes in the recipe's two sizes and the STEP picks which
 * (`createFlowStepSize`): a question with two answers wears the confirm
 * dialog's hand-sized surface and states itself in the title, while the
 * catalogs and the copy wizard take the tall one. A move that changes the size
 * crossfades rather than sliding — the box is already changing, and sending
 * the content sideways through it as well is two motions for one step.
 *
 * The three paths keep their state here, above the frame, because the frame
 * reports on them: the header shows where the guided brief or the copy wizard
 * stands, and the bottom bar carries whichever action the screen in hand has.
 */
export function AddToWorkspaceSheet() {
  const { t } = useTranslation("common");
  const request = useUIStore((s) => s.createFlow);
  const close = useUIStore((s) => s.closeCreateFlow);
  const gates = useCreateFlowGates();
  const open = request !== null;
  const shape = createFlowShape(request?.door ?? "choose", gates);
  // Only the steps the user has WALKED are state, measured against the shape
  // on every render (`create-flow-trail.ts`): capabilities and the roster
  // settle after the mount, so a screen this run turns out not to have is cut
  // from the trail before it can be stood on, and Back reads that trail.
  const [trail, setTrail] = useState<CreateFlowTrail>(EMPTY_CREATE_FLOW_TRAIL);
  const [entrance, setEntrance] = useState<CreateFlowStepDirection | "swap">(
    "forward",
  );
  const walked = reconcileWalkedTrail(trail, shape);
  const step = currentWalkedStep(walked.trail, shape);
  const back = previousWalkedStep(walked.trail);

  const agent = useCreateAgentFlow({
    // The hire path's answers live exactly as long as the path does: a run the
    // gates settle out of it clears them through the hook's own reset.
    open: open && shapeOffersHire(shape),
    onDone: close,
  });
  const team = useCreateTeamForm({
    open,
    onDone: close,
  });
  const copy = useCopyAgentWizard({
    onBack: () => goToStep("choose"),
    onDone: close,
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: the wizard's reset is re-made every render; the sheet closing is the whole trigger.
  useEffect(() => {
    if (open) return;
    setTrail(EMPTY_CREATE_FLOW_TRAIL);
    setEntrance("forward");
    copy.reset();
  }, [open]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the wizard's reset is re-made every render; the trail losing screens is the whole trigger.
  useEffect(() => {
    if (walked.trail === trail) return;
    if (walked.dropped.includes("copy")) copy.reset();
    // It changed under the user, not by their hand: nothing to rewind.
    setEntrance("swap");
    setTrail(walked.trail);
  }, [walked.trail, walked.dropped, trail]);

  // The gates settled onto a user who may create neither thing: this run has no
  // screen left to stand on. Nothing says so — no control offers that state, so
  // there is nothing the user did and nothing they could act on.
  useEffect(() => {
    if (open && step === null) close();
  }, [open, step, close]);

  // Every move goes through here so the incoming screen knows how to arrive:
  // from the side the move travels, so Back visibly rewinds — unless the frame
  // itself is resizing, which the content crosses into instead.
  function goToStep(next: CreateFlowStep) {
    // Unreachable while the sheet shows nothing; narrowing, not a fallback.
    if (step === null) return;
    if (step === "copy" && next !== "copy") copy.reset();
    setEntrance(
      createFlowStepSize(next) === createFlowStepSize(step)
        ? createFlowStepDirection(step, next)
        : "swap",
    );
    setTrail(walkToStep(walked.trail, shape, next));
  }

  const progress = useCreateFlowProgress(step, copy);
  const title = useCreateFlowTitle(step);
  if (step === null) return null;
  const size = createFlowStepSize(step);

  // The copy wizard walks its own screens first, and leaves for the choice
  // from the first of them (its `onBack`).
  const goBack = () => {
    if (step === "copy") return copy.back();
    if (back === null) close();
    else goToStep(back);
  };

  return (
    <FlowSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      size={size}
      title={title}
      back={
        back === null
          ? undefined
          : { label: t("actions.back"), onClick: goBack }
      }
      progress={progress}
      // Left out entirely on a screen with no primary: an empty bar would sit
      // under the choice cards saying nothing.
      footer={
        hasFlowPrimary(step, copy.step) ? (
          <CreateFlowFooter
            step={step}
            agent={agent}
            copy={copy}
            team={team}
            onCancel={close}
          />
        ) : undefined
      }
      labels={{ close: t("actions.close") }}
    >
      {/* Keyed on the step so the entrance replays on every move. A compact
          step only FADES, and takes no floor: the 12px a wide step travels
          hangs off the hand-sized dialog's own padding box and scrolls it
          sideways for the length of the move. */}
      <div
        key={step}
        data-direction={entrance}
        className={
          size === "compact"
            ? "create-swap-in flex flex-col"
            : entrance === "swap"
              ? "create-swap-in flex min-h-full flex-col"
              : "create-step-in flex min-h-full flex-col"
        }
      >
        <CreateFlowStepView
          step={step}
          offersChoice={shape.offersChoice}
          agent={agent}
          copy={copy}
          team={team}
          onGoToStep={goToStep}
        />
      </div>
    </FlowSheet>
  );
}
