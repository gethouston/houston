import type {
  CustomIntegrationView,
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston/engine-adapter";
import type { AppDisplay } from "../components/integrations/app-display.ts";
import { toolkitsInCategory } from "../components/integrations/browse-model.ts";
import { skillDisplayTitle } from "./humanize-skill-name.ts";
import type { SkillSummary } from "./types.ts";

export interface InstalledPreview<T> {
  visible: readonly T[];
  showExpander: boolean;
}

export function installedPreview<T>(
  items: readonly T[],
  opts: { searching: boolean; expanded: boolean; cap: number },
): InstalledPreview<T> {
  const { searching, expanded, cap } = opts;
  if (searching || expanded || items.length <= cap) {
    return { visible: items, showExpander: false };
  }
  return { visible: items.slice(0, cap), showExpander: true };
}

export interface InstalledRow {
  connection: IntegrationConnection;
  app: AppDisplay;
  accounts?: readonly IntegrationConnection[];
}

export interface FilteredInstalled {
  active: readonly InstalledRow[];
  custom: CustomIntegrationView[];
  noMatches: boolean;
}

export function filterInstalled(
  active: readonly InstalledRow[],
  custom: CustomIntegrationView[],
  query: string,
): FilteredInstalled {
  const q = query.trim().toLowerCase();
  if (!q) return { active, custom, noMatches: false };
  const nextActive = active.filter(
    (row) =>
      row.app.name.toLowerCase().includes(q) ||
      row.connection.toolkit.toLowerCase().includes(q) ||
      (row.app.description ?? "").toLowerCase().includes(q),
  );
  const nextCustom = custom.filter(
    (item) =>
      item.name.toLowerCase().includes(q) ||
      item.slug.toLowerCase().includes(q),
  );
  return {
    active: nextActive,
    custom: nextCustom,
    noMatches: nextActive.length === 0 && nextCustom.length === 0,
  };
}

export function filterInstalledBy(
  active: readonly InstalledRow[],
  custom: CustomIntegrationView[],
  catalog: IntegrationToolkit[],
  opts: { query: string; category: string },
): FilteredInstalled {
  if (opts.category === "custom") {
    return filterInstalled([], custom, opts.query);
  }
  const slugs = toolkitsInCategory(catalog, opts.category);
  const byCategory = slugs
    ? active.filter((row) => slugs.has(row.connection.toolkit))
    : active;
  const byCategoryCustom = slugs ? [] : custom;
  return filterInstalled(byCategory, byCategoryCustom, opts.query);
}

export function filterInstalledSkills(
  sorted: SkillSummary[],
  query: string,
): { filtered: SkillSummary[]; noMatches: boolean } {
  const q = query.trim().toLowerCase();
  if (!q) return { filtered: sorted, noMatches: false };
  const filtered = sorted.filter(
    (skill) =>
      skillDisplayTitle(skill).toLowerCase().includes(q) ||
      skill.name.toLowerCase().includes(q),
  );
  return { filtered, noMatches: filtered.length === 0 };
}

export function sortSkillsByTitle(
  skills: readonly SkillSummary[],
  locale?: string,
): SkillSummary[] {
  return [...skills].sort((a, b) =>
    skillDisplayTitle(a).localeCompare(skillDisplayTitle(b), locale, {
      sensitivity: "base",
    }),
  );
}
