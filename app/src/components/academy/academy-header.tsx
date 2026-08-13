import { GraduationCap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../shell/page-header/page-header";
import type { HeaderThresholds } from "../shell/page-header/page-header-layout";
import { PageHeaderTabs } from "../shell/page-header/page-header-tabs";

/**
 * The identity lozenge is ~106px: Academy 60 + its glyph (16 + 6 gap), 24px
 * horizontal padding, plus the track's 4px padding. The Academy carries no
 * tools at all, so the strip fits at every width the shell can be dragged to
 * and the mode never actually changes what is drawn. The number is kept at the
 * family's 480 anyway, so a tool added here later lands at the same breakpoint
 * as its siblings instead of inventing a second one.
 */
export const ACADEMY_HEADER_THRESHOLDS: HeaderThresholds = {
  oneRowMin: 480,
};

export function AcademyHeader() {
  const { t } = useTranslation("academy");

  return (
    <PageHeader>
      <PageHeaderTabs
        items={[
          {
            id: "academy",
            label: (
              <>
                <GraduationCap aria-hidden className="size-4 shrink-0" />
                <span className="min-w-0 truncate">{t("title")}</span>
              </>
            ),
            heading: true,
          },
        ]}
        active="academy"
        label={t("title")}
        onSelect={() => {}}
      />
    </PageHeader>
  );
}
