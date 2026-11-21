import { GraduationCap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../shell/page-header/page-header";
import type { HeaderThresholds } from "../shell/page-header/page-header-layout";
import { PageHeaderTabs } from "../shell/page-header/page-header-tabs";

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
