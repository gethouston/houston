import { layout } from "@houston/design-tokens";
import type { BillingChoice, BillingChoiceSave } from "@houston/engine-adapter";
import {
  type ChoicePickerFrame,
  choicePickerPick,
  choicePickerSaved,
  closeChoicePicker,
  type PickerState,
  type PickFlow,
  pickerBack,
  pickerSubmission,
  pickFlow,
  pickFlowProgress,
  pickRefused,
  toFreeStep,
  withPickerDraft,
} from "@houston/sdk";
import { DialogTitle } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { useSetBillingChoice } from "../../hooks/queries/use-billing-choice";
import { DoneStep } from "./free-org-picker-done";
import { FreeStep, PaidStep } from "./free-org-picker-steps";
import { PlanBriefingFrame } from "./plan-briefing-frame";
import { BriefingStep } from "./plan-briefing-swap";

const TITLE_CLASS =
  "mb-2 pr-8 text-2xl font-semibold leading-tight tracking-tight text-balance text-ink outline-none";

export type PickDraftUpdate = (
  update: (draft: PickerState) => PickerState,
) => void;

export function PickerBody({
  choice,
  flow,
  draft,
  onDraft,
  onAnswer,
  onBack,
}: {
  choice: BillingChoice;
  flow: PickFlow;
  draft: PickerState;
  onDraft: PickDraftUpdate;
  onAnswer: (outcome: BillingChoiceSave) => void;
  onBack?: () => void;
}) {
  const save = useSetBillingChoice();
  const { step, free, paid } = draft;
  const title = (text: string, id: string) => (
    <DialogTitle tabIndex={-1} className={TITLE_CLASS}>
      <span id={id}>{text}</span>
    </DialogTitle>
  );
  const submit = () => {
    const pick = pickerSubmission(draft);
    if (!pick) return;
    save.mutate(pick, {
      onSuccess: (outcome) => {
        onDraft((current) => pickRefused(current, outcome));
        onAnswer(outcome);
      },
    });
  };
  const back = () => {
    const previous = pickerBack(draft);
    if (previous) onDraft(() => previous);
    else onBack?.();
  };
  const progress = pickFlowProgress(flow, { step });

  return (
    <BriefingStep step={step}>
      {step === "paid" ? (
        <PaidStep
          choice={choice}
          selected={paid ?? ""}
          onSelect={(slug) =>
            onDraft((current) => ({ ...current, paid: slug }))
          }
          busy={save.isPending}
          title={title}
          progress={progress}
          onBack={onBack}
          onConfirm={() =>
            paid && onDraft((current) => toFreeStep(choice, current))
          }
        />
      ) : (
        <FreeStep
          choice={choice}
          paidSlug={paid}
          selected={free ?? ""}
          onSelect={(slug) =>
            onDraft((current) => ({ ...current, free: slug }))
          }
          busy={save.isPending}
          title={title}
          progress={progress}
          onBack={pickerBack(draft) || onBack ? back : undefined}
          onConfirm={submit}
        />
      )}
    </BriefingStep>
  );
}

export function FreeOrgPicker({
  choice,
  frame,
  setFrame,
  returnFocus,
}: {
  choice: BillingChoice;
  frame: ChoicePickerFrame;
  setFrame: (next: (frame: ChoicePickerFrame) => ChoicePickerFrame) => void;
  returnFocus: () => void;
}) {
  const { t } = useTranslation("plan");
  const close = () => setFrame(closeChoicePicker);
  const flow = pickFlow(choice, null, frame.pick);
  return (
    <PlanBriefingFrame
      open={frame.open}
      onDismiss={close}
      closeLabel={t("choice.picker.close")}
      width={layout["choice-dialog-width"]}
      described={frame.done !== null}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        returnFocus();
      }}
      testId="free-org-picker"
    >
      <BriefingStep step={frame.done ? "done" : "picking"}>
        {frame.done ? (
          <DoneStep
            done={frame.done}
            progress={pickFlowProgress(flow, { step: "done" })}
            onClose={close}
          />
        ) : (
          <PickerBody
            choice={choice}
            flow={flow}
            draft={choicePickerPick(frame, choice)}
            onDraft={(update) =>
              setFrame((current) =>
                withPickerDraft(
                  current,
                  update(choicePickerPick(current, choice)),
                ),
              )
            }
            onAnswer={(outcome) =>
              setFrame((current) => choicePickerSaved(current, outcome))
            }
          />
        )}
      </BriefingStep>
    </PlanBriefingFrame>
  );
}
