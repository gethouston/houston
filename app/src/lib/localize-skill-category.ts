import type { TFunction } from "i18next";

/**
 * Localized label for a skill-picker category tab. Store skills seeded in
 * English carry known categories (`skills:categories.<name>`); translated
 * store skills already carry a translated `category:` in their frontmatter
 * and anything user-authored renders verbatim via the defaultValue.
 */
export function localizeSkillCategory(category: string, t: TFunction): string {
  return t(`skills:categories.${category}`, { defaultValue: category });
}
