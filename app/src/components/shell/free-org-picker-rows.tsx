import type { BillingChoice, BillingChoiceOrg } from "@houston/engine-adapter";
import {
  type FlowProgress,
  formatPlanAmount,
  payerSeatCents,
} from "@houston/sdk";
import { cn } from "@houston-ai/core";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { canPurchaseInApp } from "../../lib/purchase-policy";
import { BILLING_CURRENCY } from "../organization/billing-tab-model";
import { OrgAvatar } from "./org-avatar";

/** The name an owned org shows: the personal org keeps today's label. */
export function useOrgName(): (org: BillingChoiceOrg) => string {
  const { t } = useTranslation("plan");
  return (org) => (org.personal ? t("choice.picker.personal") : org.name);
}

/** An org's members and its last 30 days of messages, as the picker lists them. */
export function useOrgMeta(): (org: BillingChoiceOrg) => string {
  const { t } = useTranslation("plan");
  return (org) =>
    t("choice.picker.meta", {
      first: t("choice.picker.members", { count: org.memberCount }),
      second:
        org.messages30d > 0
          ? t("choice.picker.messages", { count: org.messages30d })
          : t("choice.picker.noMessages"),
    });
}

/**
 * An org's members and what each costs the payer today ("3 members · $15
 * each"), the price off the pick's own monthly totals: a payer keeps the
 * price they signed up at. Members alone when the wire sent no total, and
 * inside the store apps, which never name a price.
 */
export function usePayerMeta(
  choice: BillingChoice,
): (org: BillingChoiceOrg) => string {
  const { t, i18n } = useTranslation("plan");
  const cents = canPurchaseInApp() ? payerSeatCents(choice) : null;
  return (org) => {
    const members = t("choice.picker.members", { count: org.memberCount });
    if (cents === null) return members;
    const price = formatPlanAmount(cents, BILLING_CURRENCY, i18n.language);
    return t("choice.picker.meta", {
      first: members,
      second: t("choice.payer.each", { price }),
    });
  };
}

export interface OrgRadioProps {
  group: string;
  /** The org's slug. */
  value: string;
  name: string;
  checked: boolean;
  /** Listed for context, never pickable: the payer step's free org. */
  disabled?: boolean;
  onSelect: (value: string) => void;
  tag?: string;
  meta: string;
}

/**
 * One org in a radio group. The whole row is the hit target (a native radio
 * inside the label, so the arrow keys move the pick), and the selected row
 * wears an ink ring and a filled check, so the choice reads without hovering.
 */
export function OrgRadio(props: OrgRadioProps) {
  return (
    <label
      className={cn(
        "plan-briefing-row grid cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl bg-chip py-3 pl-3 pr-3.5 outline outline-1 -outline-offset-1 outline-line has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-dialog",
        props.checked && "bg-hover outline-2 -outline-offset-2 outline-ink",
        props.disabled && "cursor-default opacity-45",
      )}
    >
      <input
        type="radio"
        className="sr-only"
        name={props.group}
        value={props.value}
        checked={props.checked}
        disabled={props.disabled}
        onChange={() => props.onSelect(props.value)}
      />
      <OrgAvatar slug={props.value} name={props.name} />
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <span className="truncate text-base font-medium text-ink">
            {props.name}
          </span>
          {props.tag && <RowTag label={props.tag} />}
        </span>
        <span className="mt-0.5 block text-[13px] leading-snug text-ink-muted tabular-nums">
          {props.meta}
        </span>
      </span>
      <span
        aria-hidden
        data-checked={props.checked || undefined}
        className={cn(
          "plan-briefing-tick grid size-5.5 place-items-center rounded-full outline outline-2 -outline-offset-2 outline-line-input",
          props.checked && "bg-ink outline-0",
        )}
      >
        <Check className="size-3.5 text-dialog" strokeWidth={3} />
      </span>
    </label>
  );
}

export function RowTag({ label }: { label: string }) {
  return (
    <span className="shrink-0 rounded-full bg-chip-solid px-2 py-0.5 text-[11px] font-medium leading-4 text-ink">
      {label}
    </span>
  );
}

/**
 * Where a page sits in its flow, one dot per page: the current one wider and
 * in ink.
 */
export function PickerProgress({
  progress,
}: {
  progress: FlowProgress | null;
}) {
  const { t } = useTranslation("plan");
  if (!progress) return null;
  const { current, total } = progress;
  return (
    <div className="mb-4 flex gap-1.5">
      {Array.from({ length: total }, (_, index) => index + 1).map((one) => (
        <span
          key={one}
          aria-hidden
          className={cn(
            "h-1 w-6 rounded-full bg-line",
            one === current && "w-9 bg-ink",
          )}
        />
      ))}
      <span className="sr-only">
        {t("choice.picker.step", { step: current, total })}
      </span>
    </div>
  );
}
