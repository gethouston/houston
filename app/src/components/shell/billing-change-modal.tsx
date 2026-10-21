import { layout } from "@houston/design-tokens";
import type { BillingChoiceSave } from "@houston/engine-adapter";
import {
  CLOSED_CHOICE_FRAME,
  choiceDone,
  choiceModal,
  closeChoiceFrame,
  closeDismisses,
  finishConfirming,
  finishPicking,
  nextChoiceModalFrame,
  startPicking,
} from "@houston/sdk";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useBillingChoice,
  useDismissBillingChoice,
} from "../../hooks/queries/use-billing-choice";
import { useChoiceNow } from "../../hooks/use-choice-now";
import { BillingChangeConfirm } from "./billing-change-confirm";
import { BillingChangeIntro } from "./billing-change-intro";
import { PickerBody } from "./free-org-picker";
import { DoneStep } from "./free-org-picker-done";
import { PlanBriefingFrame } from "./plan-briefing-frame";
import { BriefingStep } from "./plan-briefing-swap";

/**
 * The pricing-change announcement, shown when the app opens. Cloud only.
 * Every rule about whether it shows, what closing it does and when the picker
 * replaces the intro lives in the SDK ({@link choiceModal},
 * {@link nextChoiceModalFrame}); this holds the session's close and the frame,
 * and renders. An owner who has to pick moves from the intro to the picker,
 * then to the success step, in the same frame. After the cutover an owner
 * the cutover picked for confirms its pick or changes it the same way, and an
 * owner who picked reads that the pick applied.
 */
export function BillingChangeModal({
  otherDialogOpen,
}: {
  otherDialogOpen: boolean;
}) {
  const { data: choice } = useBillingChoice();
  const { t, i18n } = useTranslation("plan");
  const now = useChoiceNow(choice);
  const dismiss = useDismissBillingChoice();
  const [closed, setClosed] = useState(false);
  const [stored, setFrame] = useState(CLOSED_CHOICE_FRAME);
  const modal = choiceModal(choice, {
    now,
    locale: i18n.language,
    closedThisSession: closed,
    otherDialogOpen,
  });
  // Derived from the last render's frame; React re-renders before painting.
  const frame = nextChoiceModalFrame(stored, modal);
  if (frame !== stored) setFrame(frame);
  const { shown, phase } = frame;
  if (!choice || !shown) return null;
  const close = () => {
    setClosed(true);
    setFrame(closeChoiceFrame);
    if (closeDismisses(frame)) dismiss.mutate();
  };
  const confirmed = (outcome: BillingChoiceSave) => {
    const answer = finishConfirming(frame, outcome);
    if (!answer.dismiss) return;
    setClosed(true);
    setFrame(answer.frame);
    dismiss.mutate();
  };
  const notice = shown.notice;
  const intro = () => {
    switch (notice.kind) {
      case "confirm":
        return (
          <BillingChangeConfirm
            choice={choice}
            until={notice.until}
            onAnswer={confirmed}
            onChange={() => setFrame(startPicking)}
          />
        );
      case "applied": {
        const done = choiceDone(choice);
        return (
          done && (
            <DoneStep
              done={done}
              until={notice.until}
              closeLabel={t("choice.notice.gotIt")}
              onClose={close}
            />
          )
        );
      }
      default:
        return (
          <BillingChangeIntro
            notice={notice}
            choice={choice}
            onPick={() => setFrame(startPicking)}
            onClose={close}
          />
        );
    }
  };
  return (
    <PlanBriefingFrame
      open={frame.open}
      onDismiss={close}
      closeLabel={
        shown.close === "session" && phase.step !== "done"
          ? t("maybeLater")
          : t("choice.notice.close")
      }
      width={layout["choice-dialog-width"]}
      described={phase.step !== "picking"}
      testId="billing-change-modal"
    >
      <BriefingStep step={phase.step}>
        {phase.step === "done" ? (
          <DoneStep done={phase.done} onClose={close} />
        ) : phase.step === "picking" ? (
          <PickerBody
            choice={choice}
            onAnswer={(outcome) =>
              setFrame((current) => finishPicking(current, outcome))
            }
          />
        ) : (
          intro()
        )}
      </BriefingStep>
    </PlanBriefingFrame>
  );
}
