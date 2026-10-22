import { layout } from "@houston/design-tokens";
import type {
  BillingChoice,
  BillingChoicePick,
  BillingChoiceSave,
} from "@houston/engine-adapter";
import {
  type ChoicePickerFrame,
  choicePickerSaved,
  closeChoicePicker,
  type PickerState,
  type PickFlow,
  pickFlow,
  pickFlowProgress,
  reconcilePick,
  startPick,
  toFreeStep,
} from "@houston/sdk";
import { DialogTitle } from "@houston-ai/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSetBillingChoice } from "../../hooks/queries/use-billing-choice";
import { DoneStep } from "./free-org-picker-done";
import { FreeStep, PaidStep } from "./free-org-picker-steps";
import { PlanBriefingFrame } from "./plan-briefing-frame";
import { BriefingStep } from "./plan-briefing-swap";

const TITLE_CLASS =
  "mb-2 pr-8 text-2xl font-semibold leading-tight tracking-tight text-balance text-ink outline-none";

/**
 * The steps, mounted fresh on every open so each one starts on the stored
 * pick (else the busiest org). A Plus or comp payer first picks the org their
 * subscription covers, then the free one, in the same frame. Renders inside a
 * {@link PlanBriefingFrame}: the Settings entry's own, or the pricing-change
 * modal's after its intro, whose page Back returns to from the first step
 * (`onBack`). Every save's answer goes to `onAnswer`, whose SDK frame moves a
 * stored pick to the success step.
 */
export function PickerBody({
  choice,
  flow,
  onAnswer,
  onBack,
}: {
  choice: BillingChoice;
  flow: PickFlow;
  onAnswer: (outcome: BillingChoiceSave) => void;
  onBack?: () => void;
}) {
  const save = useSetBillingChoice();
  const [state, setState] = useState<PickerState>(() => startPick(choice));
  // Valid against the latest choice, which a refusal's refetch may change.
  const current = reconcilePick(choice, state);
  const { step, free, paid } = current;
  const update = (patch: Partial<PickerState>) =>
    setState({ ...current, ...patch });
  const title = (text: string, id: string) => (
    // The id rides an inner span: Radix names the frame by the title's own id.
    <DialogTitle tabIndex={-1} className={TITLE_CLASS}>
      <span id={id}>{text}</span>
    </DialogTitle>
  );

  const submit = (pick: BillingChoicePick) =>
    save.mutate(pick, { onSuccess: onAnswer });
  const progress = pickFlowProgress(flow, { step });

  return (
    <BriefingStep step={step}>
      {step === "paid" ? (
        <PaidStep
          choice={choice}
          selected={paid ?? ""}
          onSelect={(slug) => update({ paid: slug })}
          busy={save.isPending}
          title={title}
          progress={progress}
          onBack={onBack}
          onConfirm={() => paid && setState(toFreeStep(choice, current))}
        />
      ) : (
        <FreeStep
          choice={choice}
          paidSlug={paid}
          selected={free ?? ""}
          onSelect={(slug) => update({ free: slug })}
          busy={save.isPending}
          title={title}
          progress={progress}
          onBack={flow.payer ? () => update({ step: "paid" }) : onBack}
          onConfirm={() =>
            free &&
            submit(
              paid
                ? { freeOrgSlug: free, paidOrgSlug: paid }
                : { freeOrgSlug: free },
            )
          }
        />
      )}
    </BriefingStep>
  );
}

/**
 * The picker on its own, opened from Settings > Billing, then its success
 * step until the person closes it. The row that opens it holds the frame.
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
            progress={pickFlowProgress(pickFlow(choice, null), {
              step: "done",
            })}
            onClose={close}
          />
        ) : (
          <PickerBody
            choice={choice}
            flow={pickFlow(choice, null)}
            onAnswer={(outcome) =>
              setFrame((current) => choicePickerSaved(current, outcome))
            }
          />
        )}
      </BriefingStep>
    </PlanBriefingFrame>
  );
}
