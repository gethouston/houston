import { CatalogShell } from "@houston-ai/core";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PageHeaderTools } from "../shell/page-header/page-header-tools";
import { SkillsControls } from "./skills-controls";

export function SkillsReady({
  query,
  onQueryChange,
  onCreateWithAi,
  installed,
  installedCount,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  onCreateWithAi: () => void;
  installed: ReactNode;
  installedCount: number;
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
            variant={inStrip ? "strip" : "row"}
          />
        )}
      </PageHeaderTools>
      <CatalogShell
        installedTitle={t("grid.yourSkillsHeading")}
        installedCount={installedCount}
        installed={installed}
        tabs={[]}
      />
    </>
  );
}
