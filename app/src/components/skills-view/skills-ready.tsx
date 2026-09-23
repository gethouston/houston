import { CatalogShell } from "@houston-ai/core";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
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
  /** Scoped surfaces only — see {@link SkillsControls}. */
  onAddExisting?: () => void;
  /** The unfinished creation chats, standing above the skills: they are not
   *  skills yet, so they belong outside the titled and counted section. */
  drafts?: ReactNode;
  /** The rows, or the empty state standing in for them. */
  installed: ReactNode;
  /** How many rows the query keeps — the strip's count, and the one fact that
   *  says whether there are rows to title at all. */
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
            onCreateWithChat={onCreateWithChat}
            onAddExisting={onAddExisting}
            variant={inStrip ? "strip" : "row"}
          />
        )}
      </PageHeaderTools>
      {drafts}
      {/* The empty states stand alone: the shell's heading and count title the
          rows, and there are none to name. */}
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
