import { useTranslation } from "react-i18next";

/** The pick step's copy: each flow names its destinations in its own words. */
export interface PickStepCopy {
  subtitle: string;
  empty: string;
  createTrigger: string;
  namePlaceholder: string;
  nameLabel: string;
  create: string;
  creating: string;
}

/** Sharing one AI Employee: the destinations are teams. */
export function useSharePickCopy(): PickStepCopy {
  const { t } = useTranslation("teams");
  return {
    subtitle: t("shareViaTeam.pick.subtitle"),
    empty: t("shareViaTeam.pick.empty"),
    createTrigger: t("shareViaTeam.pick.createTrigger"),
    namePlaceholder: t("shareViaTeam.pick.namePlaceholder"),
    nameLabel: t("shareViaTeam.pick.nameLabel"),
    create: t("shareViaTeam.pick.create"),
    creating: t("shareViaTeam.pick.creating"),
  };
}

/** Moving a sidebar group: the destinations are spaces. */
export function useMovePickCopy(): PickStepCopy {
  const { t } = useTranslation("teams");
  return {
    subtitle: t("moveTeam.pick.subtitle"),
    empty: t("moveTeam.pick.empty"),
    createTrigger: t("moveTeam.pick.createTrigger"),
    namePlaceholder: t("moveTeam.pick.namePlaceholder"),
    nameLabel: t("moveTeam.pick.nameLabel"),
    create: t("moveTeam.pick.create"),
    creating: t("moveTeam.pick.creating"),
  };
}
