import { CatalogShell } from "@houston-ai/core";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useOrgWriteLock } from "../../hooks/use-org-write-lock";
import { OrgLockedNote } from "../shell/org-locked-fieldset";
import { PageHeaderTools } from "../shell/page-header/page-header-tools";
import { SkillsControls } from "./skills-controls";
import { skillsListShowsRows } from "./skills-list-model";

export function SkillsReady({
  query,
  onQueryChange,
  onCreateWithChat,
  onAddExisting,
  drafts,
  installed,
  installedCount,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  onCreateWithChat: () => void;
  onAddExisting?: () => void;
  drafts?: ReactNode;
  installed: ReactNode;
  installedCount: number;
}) {
  const { t } = useTranslation("skills");
  const { locked } = useOrgWriteLock();

  return (
    <>
      <PageHeaderTools>
        {(inStrip) => (
          <SkillsControls
            query={query}
            onQueryChange={onQueryChange}
            onCreateWithChat={onCreateWithChat}
            onAddExisting={onAddExisting}
            variant={inStrip ? "strip" : "row"}
            locked={locked}
          />
        )}
      </PageHeaderTools>
      <OrgLockedNote />
      {drafts}
      {skillsListShowsRows(installedCount) ? (
        <CatalogShell
          installedTitle={t("grid.yourSkillsHeading")}
          installedCount={installedCount}
          installed={installed}
          tabs={[]}
        />
      ) : (
        installed
      )}
    </>
  );
}
