import { CatalogShell } from "@houston-ai/core";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PageHeaderTools } from "../shell/page-header/page-header-tools";
import { SkillsControls } from "./skills-controls";

export function SkillsReady({
  query,
  onQueryChange,
  onCreateWithAi,
  onAddManually,
  installed,
  installedCount,
  storeTab,
  storeSizeLabel,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  onCreateWithAi: () => void;
  onAddManually: () => void;
  installed: ReactNode;
  installedCount: number;
  storeTab: ReactNode;
  storeSizeLabel: string;
}) {
  const { t } = useTranslation("skills");

  return (
    <>
      <PageHeaderTools>
        {(inStrip) => (
          <SkillsControls
            query={query}
            onQueryChange={onQueryChange}
            onCreateWithAi={onCreateWithAi}
            onAddManually={onAddManually}
            variant={inStrip ? "strip" : "row"}
          />
        )}
      </PageHeaderTools>
      <CatalogShell
        installedTitle={t("grid.yourSkillsHeading")}
        installedCount={installedCount}
        installed={installed}
        availableTitle={t("grid.availableHeading")}
        availableCount={storeSizeLabel}
        tabs={[{ value: "store", label: t("tabs.store"), content: storeTab }]}
      />
    </>
  );
}
