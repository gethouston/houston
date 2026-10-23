import { layout } from "@houston/design-tokens";
import type { BillingChoiceSave } from "@houston/engine-adapter";
import type { ChoiceIntroPage } from "@houston/sdk";
import {
  CLOSED_CHOICE_FRAME,
  choiceDone,
  choiceFrameFlow,
  choiceFramePick,
  choiceIntroProgress,
  choiceModal,
  closeChoiceFrame,
  closeDismisses,
  finishConfirming,
  finishPicking,
  listSeatPrices,
  nextChoiceModalFrame,
  nextChoicePage,
  pickFlowProgress,
  previousChoicePage,
  settleChoicePick,
  withChoicePick,
} from "@houston/sdk";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useActiveOrgBilling } from "../../hooks/queries/use-billing";
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
 * Every rule about whether it shows, what closing it does, which page it is on
 * and when the picker replaces the intro lives in the SDK ({@link choiceModal},
 * {@link nextChoiceModalFrame}, {@link nextChoicePage}); this holds the
 * session's close and the frame, and renders. An owner who has to pick moves
 * through the intro's pages to the picker, then to the success step, in the
 * same frame. After the cutover an owner
 * the cutover picked for confirms its pick or changes it the same way, and an
 * owner who picked reads that the pick applied.
 */
export function BillingChangeModal({
  otherDialogOpen,
}: {
  otherDialogOpen: boolean;
}) {
  const { data: choice } = useBillingChoice();
  const { orgs } = useActiveOrgBilling();
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
  const moved = nextChoiceModalFrame(stored, modal);
  const frame = choice ? settleChoicePick(moved, choice) : moved;
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
    if (!answer.closed) return;
    setClosed(true);
    setFrame(answer.frame);
  };
  const notice = shown.notice;
  const flow = choiceFrameFlow(frame, choice);
  const next = () => setFrame(nextChoicePage);
  const back = () => setFrame(previousChoicePage);
  const firstPage = phase.step === "intro" && phase.page === "notice";
  const intro = (page: ChoiceIntroPage) => {
    switch (notice.kind) {
      case "confirm":
        return (
          <BillingChangeConfirm
            choice={choice}
            until={notice.until}
            onAnswer={confirmed}
            onChange={next}
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
            listPrices={listSeatPrices(orgs)}
            page={page}
            progress={choiceIntroProgress(frame, choice, page)}
            onNext={next}
            onBack={back}
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
        shown.close === "session" && firstPage
          ? t("maybeLater")
          : t("choice.notice.close")
      }
      width={layout["choice-dialog-width"]}
      described={
        phase.step === "done" ||
        (phase.step === "intro" && notice.kind !== "pick")
      }
      testId="billing-change-modal"
    >
      <BriefingStep step={phase.step === "intro" ? phase.page : phase.step}>
        {phase.step === "done" ? (
          <DoneStep
            done={phase.done}
            progress={pickFlowProgress(flow, { step: "done" })}
            onClose={close}
          />
        ) : phase.step === "picking" ? (
          <PickerBody
            choice={choice}
            flow={flow}
            draft={choiceFramePick(frame, choice)}
            onDraft={(update) =>
              setFrame((current) =>
                withChoicePick(
                  current,
                  update(choiceFramePick(current, choice)),
                ),
              )
            }
            onBack={back}
            onAnswer={(outcome) =>
              setFrame((current) => finishPicking(current, outcome))
            }
          />
        ) : (
          intro(phase.page)
        )}
      </BriefingStep>
    </PlanBriefingFrame>
  );
}
