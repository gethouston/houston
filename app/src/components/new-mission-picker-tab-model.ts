export const FEATURED_SKILLS_TAB_ID = "__featured__";
export const OTHER_SKILLS_TAB_ID = "__other__";

export interface PickerTab {
  id: string;
  label: string;
}

export function buildSkillPickerTabs({
  categoryNames,
  hasFeatured,
  hasOther,
  featuredLabel,
  otherLabel,
  categoryLabel,
}: {
  categoryNames: string[];
  hasFeatured: boolean;
  hasOther: boolean;
  featuredLabel: string;
  otherLabel: string;
  /**
   * Localizes a category tab's visible label. The tab id stays the raw
   * category string: it keys the skills-by-category map.
   */
  categoryLabel: (category: string) => string;
}): PickerTab[] {
  return [
    ...(hasFeatured
      ? [{ id: FEATURED_SKILLS_TAB_ID, label: featuredLabel }]
      : []),
    ...categoryNames.map((category) => ({
      id: category,
      label: categoryLabel(category),
    })),
    ...(hasOther ? [{ id: OTHER_SKILLS_TAB_ID, label: otherLabel }] : []),
  ];
}

export function resolveActiveSkillPickerTab(
  tabs: PickerTab[],
  activeTab: string,
): string {
  if (tabs.some((tab) => tab.id === activeTab)) return activeTab;
  return tabs[0]?.id ?? "";
}

export function shouldShowSkillPickerTabs(tabs: PickerTab[]): boolean {
  return tabs.length > 1;
}
