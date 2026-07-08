import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { migrateStoreSkillsToLocale } from "../lib/store-skill-locale-migration";
import type { Agent } from "../lib/types";
import { useSkills } from "./queries";

/**
 * Lazily swap this agent's unedited English store skills for their
 * translated versions whenever the UI language is es/pt (see
 * `lib/store-skill-locale-migration.ts` for the contract). Runs off the
 * skills list the panel already fetches; a successful swap fires
 * `SkillsChanged`, the list refetches, and the effect finds nothing left to
 * do. Engine-call failures surface through the standard `call()` toast path;
 * the catch here only stops an unhandled-rejection loop, and the next mount
 * retries.
 */
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
