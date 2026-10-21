import type { BillingChoice, BillingChoiceSave } from "@houston/engine-adapter";
import { appliedPick, choiceDone } from "@houston/sdk";
import { DialogDescription, DialogTitle } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { useSetBillingChoice } from "../../hooks/queries/use-billing-choice";
import { ChoiceOrgList } from "./free-org-picker-list";
import { useOrgName } from "./free-org-picker-rows";
import { PlanBriefingCta, PlanBriefingQuietButton } from "./plan-briefing-cta";

/**
 * What the cutover picked for an owner who never picked: the free org, the
 * org the subscription moved to, and every other org with its lock date.
 * Confirm stores the same pick; Change opens the picker on it. The save's
 * answer goes to `onAnswer`, whose SDK frame closes on a stored pick and
 * keeps this step on a refusal, which shows its own copy.
 */
export function BillingChangeConfirm({
  choice,
  until,
  onAnswer,
  onChange,
}: {
  choice: BillingChoice;
  /** The change window's last day, formatted by the notice. */
  until: string;
  onAnswer: (outcome: BillingChoiceSave) => void;
  onChange: () => void;
}) {
  const { t } = useTranslation("plan");
  const orgName = useOrgName();
  const save = useSetBillingChoice();
  const done = choiceDone(choice);
  const pick = appliedPick(choice);
  if (!done || !pick) return null;
  const free = orgName(done.free);
  return (
    <>
      <DialogTitle
        tabIndex={-1}
        className="mb-2 pr-8 text-balance text-2xl font-semibold leading-tight tracking-tight text-ink outline-none"
      >
        {done.paid
          ? t("choice.applied.confirm.titlePaid", {
              free,
              paid: orgName(done.paid),
            })
          : t("choice.applied.confirm.title", { free })}
      </DialogTitle>
      <DialogDescription className="mb-5 text-base leading-normal text-ink-muted">
        {t("choice.applied.confirm.sub", { date: until })}
      </DialogDescription>
      <ChoiceOrgList orgs={done.orgs} meta />
      <p className="mb-6 text-[13px] text-ink-muted">
        {done.orgs.some((org) => org.status === "locks") &&
          t("choice.applied.locks")}
      </p>
      {/* The phone sheet seats the actions at the bottom, under the thumb. */}
      <div className="mt-auto flex flex-col md:mt-0">
        <PlanBriefingCta
          label={t("choice.applied.confirm.confirm")}
          disabled={save.isPending}
          onClick={() => save.mutate(pick, { onSuccess: onAnswer })}
        />
        <PlanBriefingQuietButton onClick={onChange} disabled={save.isPending}>
          {t("choice.applied.confirm.change")}
        </PlanBriefingQuietButton>
      </div>
    </>
  );
}
