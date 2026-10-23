import type { BillingChoice } from "@houston/engine-adapter";
import { type AnnouncedChoice, orgSeatPrice } from "@houston/sdk";
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
import { useOrgName } from "./free-org-picker-rows";

/** The notices the modal's intro announces, before the cutover. */
export type IntroNotice = Extract<
  AnnouncedChoice,
  { kind: "pick" | "single_org" | "member" }
>;

export interface NoticePoint {
  icon: LucideIcon;
  title: string;
  body: string;
}

/**
 * The pricing-change modal's first page, as points, for the notice it
 * announces. Only a pick names the price, which comes from the SDK.
 */
export function useNoticePoints(
  notice: IntroNotice,
  choice: BillingChoice,
): NoticePoint[] {
  const { t, i18n } = useTranslation("plan");
  const orgName = useOrgName();
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
          ? {
              icon: CreditCard,
              title: t("choice.notice.covers.title"),
              body: t("choice.notice.covers.body", {
                price: orgSeatPrice(i18n.language),
              }),
            }
          : {
              icon: CreditCard,
              title: t("choice.notice.rest.title", {
                price: orgSeatPrice(i18n.language),
              }),
              body: t("choice.notice.rest.body"),
            },
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

/** The pick's second page: what happens to the orgs not kept free. */
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
