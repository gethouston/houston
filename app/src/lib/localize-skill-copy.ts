import type { TFunction } from "i18next";
import enSkills from "../locales/en/skills.json";
import { humanizeSkillName } from "./humanize-skill-name";

/** Localized display copy for one skill card / chip / chat marker. */
export interface SkillCopy {
  title: string;
  description: string;
}

interface CatalogEntry {
  name: string;
  description: string;
}

/**
 * English reference generated from `store/agents/*` by
 * `scripts/gen-skill-catalog-i18n.mjs`. Doubles as the edit-detection
 * baseline: a skill whose on-disk description drifted from the packaged
 * copy is shown verbatim (see below).
 */
const EN_CATALOG = (
  enSkills as { catalog: Record<string, Record<string, CatalogEntry>> }
).catalog;

/**
 * The locale validator bans U+2014 in every locale file, so the generated
 * English reference stores packaged descriptions with em dashes normalized
 * to hyphens. Apply the same normalization before comparing a live skill
 * against it. Mirrored in `scripts/gen-skill-catalog-i18n.mjs`.
 */
export function normalizeSkillCopy(text: string): string {
  return text.replace(/—/g, "-");
}

/**
 * Localized display name + description for a skill, mirroring
 * `localizeCatalogCopy` (agent store cards, HOU-587).
 *
 * Keys live under `skills:catalog.<configId>.<slug>` — keyed by the agent's
 * persisted `configId` because two store agents may ship the same slug with
 * different copy (`research-a-topic` in marketing vs operations), and because
 * an agent created from a third-party definition must keep its author's
 * language (its configId has no catalog entry, so it falls through).
 *
 * Skills are user-owned copies after seeding (agents self-improve them), so
 * the description is only localized while it still matches the packaged
 * English copy; an edited skill shows its real, current description instead
 * of a stale translation. The name always localizes: the slug is the
 * directory identity, so it can't drift without becoming a different skill.
 */
export function localizeSkillCopy(
  skill: { name: string; description?: string | null },
  configId: string | undefined,
  t: TFunction,
): SkillCopy {
  const fallback = {
    title: humanizeSkillName(skill.name),
    description: skill.description ?? "",
  };
  if (!configId) return fallback;
  const entry = EN_CATALOG[configId]?.[skill.name];
  if (!entry) return fallback;
  return {
    title: t(`skills:catalog.${configId}.${skill.name}.name`, {
      defaultValue: fallback.title,
    }),
    description:
      normalizeSkillCopy(fallback.description) === entry.description
        ? t(`skills:catalog.${configId}.${skill.name}.description`, {
            defaultValue: fallback.description,
          })
        : fallback.description,
  };
}

/**
 * Localized label for a skill-picker category tab. First-party store skills
 * ship known categories (`skills:categories.<name>`); anything else (a
 * user-authored category) renders verbatim via the defaultValue.
 */
export function localizeSkillCategory(category: string, t: TFunction): string {
  return t(`skills:categories.${category}`, { defaultValue: category });
}
