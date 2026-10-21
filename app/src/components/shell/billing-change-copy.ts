import type { BillingChoice } from "@houston/engine-adapter";
import type { AnnouncedChoice } from "@houston/sdk";
import {
  CreditCard,
  Gift,
  Layers,
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
 * The pricing-change modal's points, for the notice it announces. None names
 * a price: the payer step of the picker carries it.
 */
export function useNoticePoints(
  notice: IntroNotice,
  choice: BillingChoice,
): NoticePoint[] {
  const { t } = useTranslation("plan");
  const orgName = useOrgName();
  const team = (body: string): NoticePoint => ({
    icon: Users,
    title: t("choice.notice.team.title"),
    body,
  });
  switch (notice.kind) {
    case "pick":
      return [
        team(t("choice.notice.team.any")),
        {
          icon: Gift,
          title: t("choice.notice.oneFree.title"),
          body: t("choice.notice.oneFree.body"),
        },
        notice.payer
          ? {
              icon: CreditCard,
              title: t("choice.notice.moves.title"),
              body: t("choice.notice.moves.body"),
            }
          : {
              icon: Layers,
              title: t("choice.notice.pick.title"),
              body: t("choice.notice.pick.body"),
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
