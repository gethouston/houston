import { LibraryBig } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../shell/page-header/page-header";
import type { HeaderThresholds } from "../shell/page-header/page-header-layout";
import { PageHeaderTabs } from "../shell/page-header/page-header-tabs";

/**
 * The identity lozenge is ~82px: Skills 33 + its glyph (16 + 6 gap), 24px
 * horizontal padding, plus the track's 4px padding. The right zone is ~333px:
 * compact search 220 + 8 gap + New skill button 105. `82 + 333 + 40 (px-5)
 * + 12 (zone gap) = 467`, rounded UP to 480. A single lozenge has nothing to
 * collapse, so below this point the tools stack honestly.
 */
export const SKILLS_HEADER_THRESHOLDS: HeaderThresholds = {
  oneRowMin: 480,
};

export function SkillsHeader() {
  const { t } = useTranslation("skills");

  return (
    <PageHeader>
      <PageHeaderTabs
        items={[
          {
            id: "skills",
            label: (
              <>
                <LibraryBig aria-hidden className="size-4 shrink-0" />
                <span className="min-w-0 truncate">
                  {t("global.pageTitle")}
                </span>
              </>
            ),
            heading: true,
          },
        ]}
        active="skills"
        label={t("global.headerLabel")}
        onSelect={() => {}}
      />
    </PageHeader>
  );
}
