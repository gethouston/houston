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
 * `scripts/gen-skill-catalog-i18n.mjs`. Keys are
 * `catalog.<storeAgentId>.<slug>` — the store agent id disambiguates the
 * slugs two store agents both ship with different copy (`research-a-topic`,
 * `calibrate-my-voice`).
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

/** slug → the catalog entries (one per store agent) shipping that slug. */
let bySlug: Map<
  string,
  Array<{ storeAgentId: string; description: string }>
> | null = null;

function catalogBySlug() {
  if (!bySlug) {
    bySlug = new Map();
    for (const [storeAgentId, entries] of Object.entries(EN_CATALOG)) {
      for (const [slug, entry] of Object.entries(entries)) {
        const list = bySlug.get(slug) ?? [];
        list.push({ storeAgentId, description: entry.description });
        bySlug.set(slug, list);
      }
    }
  }
  return bySlug;
}

/**
 * Localized display name + description for a skill, the skills sibling of
 * `localizeCatalogCopy` (agent store cards, HOU-587).
 *
 * A skill is recognized by its `(slug, packaged English description)` pair:
 * the host does not persist which template an agent was created from (the
 * engine adapter fabricates `Agent.configId`, so it cannot key anything),
 * and installed skills are user-owned copies after seeding. Matching the
 * description against the generated English reference is therefore both the
 * identity check and the edit gate in one:
 *
 * - an unedited store skill matches its packaged copy exactly and renders
 *   the `skills:catalog.<storeAgentId>.<slug>` translation — including the
 *   right variant when two store agents ship the same slug;
 * - an edited / self-improved skill, or any third-party / user-authored
 *   skill, matches nothing and renders its real copy verbatim (author's
 *   language wins).
 */
export function localizeSkillCopy(
  skill: { name: string; description?: string | null },
  t: TFunction,
): SkillCopy {
  const fallback = {
    title: humanizeSkillName(skill.name),
    description: skill.description ?? "",
  };
  const candidates = catalogBySlug().get(skill.name);
  if (!candidates) return fallback;
  const normalized = normalizeSkillCopy(fallback.description);
  const match = candidates.find((c) => c.description === normalized);
  if (!match) return fallback;
  return {
    title: t(`skills:catalog.${match.storeAgentId}.${skill.name}.name`, {
      defaultValue: fallback.title,
    }),
    description: t(
      `skills:catalog.${match.storeAgentId}.${skill.name}.description`,
      { defaultValue: fallback.description },
    ),
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
