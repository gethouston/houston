import type {
  CustomIntegrationView,
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import type { AppDisplay } from "../components/integrations/app-display.ts";
import { toolkitsInCategory } from "../components/integrations/browse-model.ts";
import { skillDisplayTitle } from "./humanize-skill-name.ts";
import type { SkillSummary } from "./types.ts";

/**
 * The pure logic the three consolidated **Installed** strips share: the
 * catalog/skills/providers "installed" sections all render a preview-capped
 * `CatalogGrid` behind a `CatalogShowMore` expander at rest, uncapped while
 * searching. Each strip re-implemented that split inline with a different
 * (and, in two cases, oppositely-named) `capped` flag; this module owns the
 * ONE decision instead. It stays React-/DOM-free so the strips' pure filters
 * can live here too and be tested under `node --test` without dragging in the
 * `@houston-ai/core` component barrel.
 */

/** How an installed strip splits its rows for one render. */
export interface InstalledPreview<T> {
  /** The rows to render: every item while searching or expanded, else the
   *  first `cap`. */
  visible: readonly T[];
  /** Whether to render the "Show all N" expander — true only when the preview
   *  is actively hiding rows (N is the full `items.length`, not `visible`). */
  showExpander: boolean;
}

/**
 * Decide which installed rows render and whether the expander shows.
 *
 * `searching` or `expanded` reveals every item with no expander (searching IS
 * the act of looking past the preview; expanding is the explicit ask). At rest
 * a list longer than `cap` shows its first `cap` rows behind the expander;
 * `cap` or fewer rows all render with no expander.
 *
 * `cap` is injected rather than imported so this module never pulls the
 * `CATALOG_INSTALLED_PREVIEW_CAP` constant's `@houston-ai/core` home (a JSX
 * barrel) into `node --test`; the strips pass that shared constant in.
 */
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

/** The minimal shape an installed integration row needs — both the global
 *  page's `ActiveAppRow` and the agent tab's usable rows satisfy it. */
export interface InstalledRow {
  connection: IntegrationConnection;
  app: AppDisplay;
}

/** The installed rows the section should render, narrowed by its own search. */
export interface FilteredInstalled {
  active: readonly InstalledRow[];
  custom: CustomIntegrationView[];
  /** True ONLY when a non-empty query matched nothing in either list — the
   *  cue to show a "no results" note in place of the section. */
  noMatches: boolean;
}

/**
 * Narrow the installed integration rows by the section's own search: a
 * case-insensitive substring over an app's name/toolkit/description and a custom
 * integration's name/slug (custom rows carry no description). Description parity
 * with the browse side ({@link matchesQuery}) keeps ONE query from hiding an
 * installed app that the same term surfaces in "Available". An empty query keeps
 * everything (never a "no matches"). Pure, so the page holds the query and the
 * section stays a renderer.
 */
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

/**
 * Narrow the installed rows by the surface's ONE controls row — the shared
 * query AND category that also filter the discovery area. Category narrows
 * first via {@link toolkitsInCategory} over each active row's toolkit slug;
 * custom integrations carry no category, so ANY active category excludes them
 * (a query alone still matches them by name/slug, delegated to
 * {@link filterInstalled}). `category === "all"` applies the query only. Pure,
 * so the surface owns the state and the section stays a renderer.
 */
export function filterInstalledBy(
  active: readonly InstalledRow[],
  custom: CustomIntegrationView[],
  catalog: IntegrationToolkit[],
  opts: { query: string; category: string },
): FilteredInstalled {
  const slugs = toolkitsInCategory(catalog, opts.category);
  const byCategory = slugs
    ? active.filter((row) => slugs.has(row.connection.toolkit))
    : active;
  const byCategoryCustom = slugs ? [] : custom;
  return filterInstalled(byCategory, byCategoryCustom, opts.query);
}

/**
 * Narrow the installed skills by the strip's own search: a case-insensitive
 * substring over the display name AND the underlying slug, so a user finds a
 * skill by either what they see or what they typed to create it. An empty query
 * keeps everything (never a "no matches"). Pure — the strip stays a renderer.
 */
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
