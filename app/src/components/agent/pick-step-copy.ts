import { useTranslation } from "react-i18next";

export interface PickStepCopy {
  subtitle: string;
  empty: string;
  createTrigger: string;
  namePlaceholder: string;
  nameLabel: string;
  create: string;
  creating: string;
}

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
