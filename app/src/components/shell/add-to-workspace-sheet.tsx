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

export function AddToWorkspaceSheet() {
  const { t } = useTranslation("common");
  const request = useUIStore((s) => s.createFlow);
  const close = useUIStore((s) => s.closeCreateFlow);
  const gates = useCreateFlowGates();
  const open = request !== null;
  const shape = createFlowShape(request?.door ?? "choose", gates);
  const [trail, setTrail] = useState<CreateFlowTrail>(EMPTY_CREATE_FLOW_TRAIL);
  const [entrance, setEntrance] = useState<CreateFlowStepDirection | "swap">(
    "forward",
  );
  const walked = reconcileWalkedTrail(trail, shape);
  const step = currentWalkedStep(walked.trail, shape);
  const back = previousWalkedStep(walked.trail);

  const agent = useCreateAgentFlow({
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
    setEntrance("swap");
    setTrail(walked.trail);
  }, [walked.trail, walked.dropped, trail]);

  useEffect(() => {
    if (open && step === null) close();
  }, [open, step, close]);

  function goToStep(next: CreateFlowStep) {
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
