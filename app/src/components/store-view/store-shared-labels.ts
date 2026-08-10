import type { TFunction } from "i18next";

export function agentCardLabels(t: TFunction<"store">) {
  return {
    newAgent: t("shared.newAgent"),
    installs: t("shared.installs"),
    tryNow: t("shared.tryNow"),
  };
}

export function creatorCardLabels(t: TFunction<"store">) {
  return {
    fallbackBio: t("shared.creatorFallbackBio"),
    agent: t("shared.agent"),
    agents: t("shared.agents"),
    installs: t("shared.installs"),
  };
}

export function catalogControlLabels(t: TFunction<"store">) {
  return {
    searchPlaceholder: t("browse.searchPlaceholder"),
    clearSearch: t("clearSearch"),
    allCategories: t("browse.allCategories"),
    agents: t("browse.agents"),
    creators: t("browse.creators"),
    sortAgents: t("browse.sortAgents"),
    mostInstalled: t("browse.mostInstalled"),
    alphabetical: t("browse.alphabetical"),
  };
}
