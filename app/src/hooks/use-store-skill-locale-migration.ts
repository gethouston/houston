import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { migrateStoreSkillsToLocale } from "../lib/store-skill-locale-migration";
import type { Agent } from "../lib/types";
import { useSkills } from "./queries";

export function useStoreSkillLocaleMigration(agent: Agent | null) {
  const { i18n } = useTranslation();
  const { data: skills } = useSkills(agent?.folderPath);
  const locale = i18n.language;

  useEffect(() => {
    if (!agent || !skills || skills.length === 0) return;
    void migrateStoreSkillsToLocale(
      agent.folderPath,
      agent.id,
      locale,
      skills,
    ).catch((err) => {
      console.error("[skills] locale migration pass failed", err);
    });
  }, [agent, skills, locale]);
}
