import {
  CATALOG_INSTALLED_PREVIEW_CAP,
  CatalogGrid,
  CatalogRow,
  CatalogShowMore,
} from "@houston-ai/core";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { skillDisplayTitle } from "../../lib/humanize-skill-name";
import {
  filterInstalledSkills,
  installedPreview,
} from "../../lib/installed-preview";
import type { SkillSummary } from "../../lib/types";
import { SkillIcon } from "../skill-icon";
import { skillIntegrationChips } from "../skill-integration-chips";

/** How many app logos a row shows before collapsing the rest into "+N". A row
 *  is a dense line, so it stays well below the card surfaces' allowance. */
const ROW_LOGO_CAP = 3;

// The pure search filter lives in the node-safe `lib/installed-preview` module
// (tested under `node --test`); re-exported here so any consumer keeps
// importing it from the strip.
export { filterInstalledSkills } from "../../lib/installed-preview";

/**
 * The consolidated **Your skills** strip's inputs for {@link CatalogShell}: the
 * A-Z sorted list (also the parent's source for the open editor), the count the
 * section header shows (matches while the page search filters, the total at
 * rest), and the strip body: a {@link CatalogGrid} of {@link CatalogRow}s (the
 * browse/store row grammar — the skill's own icon, title, one-line description,
 * and, for a skill that declares any, a quiet trailing row of the app logos it
 * works with; the whole row opens the edit modal). The page owns the ONE search
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
  const { t } = useTranslation("skills");
  const [expanded, setExpanded] = useState(false);
  const sorted = useMemo(
    () => [...skills].sort((a, b) => a.name.localeCompare(b.name)),
    [skills],
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
        <CatalogGrid>
          {visible.map((skill) => (
            <CatalogRow
              key={skill.name}
              icon={
                <SkillIcon
                  image={skill.image}
                  bubbleClassName="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-line-input"
                />
              }
              title={skillDisplayTitle(skill)}
              description={skill.description || undefined}
              trailing={
                <div className="flex shrink-0 items-center gap-2">
                  {skillIntegrationChips(skill.integrations, ROW_LOGO_CAP)}
                  <ChevronRight
                    aria-hidden
                    className="size-4 shrink-0 text-ink-muted"
                  />
                </div>
              }
              onClick={() => onEditSkill(skill.name)}
            />
          ))}
        </CatalogGrid>
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
