import type { BillingChoice, SeatPrices } from "@houston/engine-adapter";
import {
  type AnnouncedChoice,
  formatPlanAmount,
  payerSeatCents,
  seatPlans,
} from "@houston/sdk";
import type { TFunction } from "i18next";
import {
  ArrowRightLeft,
  CreditCard,
  Eye,
  Gift,
  Lock,
  type LucideIcon,
  Smile,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { canPurchaseInApp } from "../../lib/purchase-policy";
import { BILLING_CURRENCY } from "../organization/billing-tab-model";
import { useOrgName } from "./free-org-picker-rows";

export type IntroNotice = Extract<
  AnnouncedChoice,
  { kind: "pick" | "single_org" | "member" }
>;

export interface NoticePoint {
  icon: LucideIcon;
  title: string;
  body: string;
}

export function useNoticePoints(
  notice: IntroNotice,
  choice: BillingChoice,
  listPrices: SeatPrices | null,
): NoticePoint[] {
  const { t, i18n } = useTranslation("plan");
  const orgName = useOrgName();
  const priced = canPurchaseInApp();
  const money = (cents: number) =>
    formatPlanAmount(cents, BILLING_CURRENCY, i18n.language);
  const team = (body: string): NoticePoint => ({
    icon: Users,
    title: t("choice.notice.team.title"),
    body,
  });
  switch (notice.kind) {
    case "pick":
      return [
        team(t("choice.notice.team.invite")),
        {
          icon: Gift,
          title: t("choice.notice.oneFree.title"),
          body: t("choice.notice.oneFree.body"),
        },
        notice.payer
          ? coversPoint(t, priced ? payerSeatCents(choice) : null, money)
          : restPoint(t, priced ? listPrices : null, money),
      ];
    case "single_org": {
      const org = choice.orgs.find((one) => one.slug === notice.orgSlug);
      const name = org ? orgName(org) : "";
      return [
        team(t("choice.notice.team.named", { name })),
        {
          icon: notice.payer ? CreditCard : Gift,
          title: notice.payer
            ? t("choice.notice.paysFor", { name })
            : t("choice.notice.staysFree", { name }),
          body: t("choice.notice.nothingToDo"),
        },
      ];
    }
    case "member":
      return [
        team(t("choice.notice.team.any")),
        {
          icon: Smile,
          title: t("choice.notice.member.title"),
          body: t("choice.notice.member.body"),
        },
      ];
  }
}

export function useNotKeptPoints(): NoticePoint[] {
  const { t } = useTranslation("plan");
  return [
    {
      icon: Eye,
      title: t("choice.notice.notKept.open.title"),
      body: t("choice.notice.notKept.open.body"),
    },
    {
      icon: ArrowRightLeft,
      title: t("choice.notice.notKept.move.title"),
      body: t("choice.notice.notKept.move.body"),
    },
    {
      icon: Lock,
      title: t("choice.notice.notKept.wait.title"),
      body: t("choice.notice.notKept.wait.body"),
    },
  ];
}

type PlanT = TFunction<"plan">;
type Money = (cents: number) => string;

function coversPoint(
  t: PlanT,
  seatCents: number | null,
  money: Money,
): NoticePoint {
  return {
    icon: CreditCard,
    title: t("choice.notice.covers.title"),
    body:
      seatCents === null
        ? t("choice.notice.covers.bodyNoPrice")
        : t("choice.notice.covers.body", { price: money(seatCents) }),
  };
}

function restPoint(
  t: PlanT,
  prices: SeatPrices | null,
  money: Money,
): NoticePoint {
  const [monthly, yearly] = prices ? seatPlans(prices) : [];
  return {
    icon: CreditCard,
    title: !monthly
      ? t("choice.notice.rest.titleNoPrice")
      : yearly
        ? t("choice.notice.rest.titleBoth", {
            monthly: money(monthly.perMonthCents),
            yearly: money(yearly.perMonthCents),
          })
        : t("choice.notice.rest.title", {
            price: money(monthly.perMonthCents),
          }),
    body: t("choice.notice.rest.body"),
  };
}
