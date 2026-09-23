import { ListChecks } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../shell/page-header/page-header";
import type { HeaderThresholds } from "../shell/page-header/page-header-layout";
import { PageHeaderTabs } from "../shell/page-header/page-header-tabs";
import { PageHeaderToolsProvider } from "../shell/page-header/page-header-tools";
import { SkillsBody } from "./skills-view";

/**
 * The identity lozenge is ~83px: Skills 33 + its glyph (16 + 6 gap), 24px
 * horizontal padding, plus the track's 4px padding. The library's tools are
 * ~333 (search 220 + 8 + Create skill 105). `83 + 333 + 40 (px-5) + 12 (zone
 * gap) = 468`, kept at the family's 480 so a tool added here later lands at the
 * same breakpoint as its siblings instead of inventing a second one. Below it
 * the tools take the body row.
 */
export const SKILLS_HEADER_THRESHOLDS: HeaderThresholds = { oneRowMin: 480 };

/**
 * The screen's strip: one static heading lozenge wearing the rail row's mark,
 * so the door and the page agree on what this place looks like. Nothing to
 * switch, so the cluster is a heading at every width rather than a control.
 */
function SkillsHeader() {
  const { t } = useTranslation("skills");
  const title = t("global.pageTitle");

  return (
    <PageHeader>
      <PageHeaderTabs
        items={[
          {
            id: "skills",
            label: (
              <>
                <ListChecks aria-hidden className="size-4 shrink-0" />
                <span className="min-w-0 truncate">{title}</span>
              </>
            ),
            heading: true,
          },
        ]}
        active="skills"
        label={title}
        onSelect={() => {}}
      />
    </PageHeader>
  );
}

/**
 * The shared Skills library as a screen of its own: what every agent in the
 * space can do is a place the user goes, so it owns the whole window from its
 * own row in the rail.
 *
 * The page is the frame; {@link SkillsBody} is the surface. The tools provider
 * spans both, so the body portals its search and "Create skill" into this
 * strip, and the LIST wears the strip while the skill editor replaces the whole
 * thing with its own (whose back arrow returns to the list).
 */
export function SkillsPage() {
  return (
    <PageHeaderToolsProvider thresholds={SKILLS_HEADER_THRESHOLDS}>
      <SkillsBody listHeader={<SkillsHeader />} />
    </PageHeaderToolsProvider>
  );
}
