import {
  CATALOG_INSTALLED_PREVIEW_CAP,
  CatalogShowMore,
} from "@houston-ai/core";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  filterInstalledSkills,
  installedPreview,
  sortSkillsByTitle,
} from "../../lib/installed-preview";
import type { SkillSummary } from "../../lib/types";
import { SkillCatalogGrid } from "../skills/skill-catalog-rows";

/**
 * The consolidated **Your skills** strip's inputs for {@link CatalogShell}: the
 * A-Z sorted list (also the parent's source for the open editor), the count the
 * section header shows (matches while the page search filters, the total at
 * rest), and the strip body: shared skill catalog rows (the browse/store row
 * grammar — the skill's own icon, title, one-line description, and any declared
 * app logos; the whole row opens the edit modal). The page owns the ONE search
 * `query` and passes it in; it filters this strip AND the store. At rest the
 * grid shows at most {@link CATALOG_INSTALLED_PREVIEW_CAP} rows behind a
 * "Show all" expander so a well-stocked strip never buries the discovery tabs;
 * an active query drops the cap and shows every match (searching IS looking past
 * the preview). Returns `installed === undefined` when there is nothing to show
 * — no skills at all, OR a query that matches none — so the shell drops the
 * section entirely instead of leaving an empty heading.
 */
export function useInstalledSkillsStrip(
  skills: SkillSummary[],
  onEditSkill: (name: string) => void,
  query: string,
): {
  sorted: SkillSummary[];
  installedCount: number;
  installed: ReactNode | undefined;
} {
  const { i18n, t } = useTranslation("skills");
  const [expanded, setExpanded] = useState(false);
  const sorted = useMemo(
    () => sortSkillsByTitle(skills, i18n.language),
    [i18n.language, skills],
  );
  const { filtered } = filterInstalledSkills(sorted, query);

  // An active query shows every match; at rest the grid caps its preview.
  const searching = query.trim() !== "";
  const { visible, showExpander } = installedPreview(filtered, {
    searching,
    expanded,
    cap: CATALOG_INSTALLED_PREVIEW_CAP,
  });

  const installed =
    filtered.length === 0 ? undefined : (
      <>
        <SkillCatalogGrid
          skills={visible}
          onOpen={(skill) => onEditSkill(skill.name)}
        />
        {showExpander && (
          <CatalogShowMore onClick={() => setExpanded(true)}>
            {t("grid.showAllSkills", { count: filtered.length })}
          </CatalogShowMore>
        )}
      </>
    );

  return {
    sorted,
    installedCount: filtered.length,
    installed,
  };
}
