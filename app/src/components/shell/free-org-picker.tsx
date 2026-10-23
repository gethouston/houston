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

/** Changes the picker's draft from the latest one, reconciled. */
export type PickDraftUpdate = (
  update: (draft: PickerState) => PickerState,
) => void;

/**
 * The picker's steps over a draft its frame holds (`draft`, already valid
 * against `choice`), so the pricing-change modal keeps it while the person
 * steps back into the intro. A Plus or comp payer first picks the org their
 * subscription covers, then the free one, in the same frame. Renders inside a
 * {@link PlanBriefingFrame}: the Settings entry's own, or the pricing-change
 * modal's after its intro, whose page Back returns to from the first step
 * (`onBack`). Every save's answer goes to `onAnswer`, whose SDK frame moves a
 * stored pick to the success step.
 */
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
    // The id rides an inner span: Radix names the frame by the title's own id.
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

/**
 * The picker on its own, opened from Settings > Billing, then its success
 * step until the person closes it. The row that opens it holds the frame,
 * and the frame holds the draft for one open ({@link choicePickerPick}).
 */
export function FreeOrgPicker({
  choice,
  frame,
  setFrame,
  returnFocus,
}: {
  choice: BillingChoice;
  frame: ChoicePickerFrame;
  setFrame: (next: (frame: ChoicePickerFrame) => ChoicePickerFrame) => void;
  /** Where focus lands on close: the frame has no trigger of its own. */
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
