import { Button, CatalogSectionHeader } from "@houston-ai/core";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { HoustonLibrarySkill } from "../../lib/houston-skill-library";
import { HoustonSkillShelves } from "../tabs/houston-skill-shelves";
import { useHoustonSkillLibraryData } from "../tabs/use-houston-skill-library";

/**
 * The global page's Custom skills tab (HOU-792): the same sources the
 * per-agent tab offers — build one with an agent (primary), add one manually
 * (the multi-agent from-scratch dialog), or pull a curated skill from the
 * Houston library — but every install routes through the caller, which opens
 * the pick-agents dialog and fans the copy out.
 */
export function GlobalCustomTab({
  onCreateWithAi,
  onAddClick,
  onInstallLibrary,
  installing,
  installedSkillNames,
}: {
  /** Start the create-with-AI chat (agent picked first when several). */
  onCreateWithAi: () => void;
  /** Open the manual from-scratch dialog (multi-agent). */
  onAddClick: () => void;
  /** A library row's install click — opens the pick-agents flow. */
  onInstallLibrary: (skill: HoustonLibrarySkill) => void;
  /** Slug currently fanning out (drives that row's spinner), or null. */
  installing: string | null;
  /** Slugs installed on ANY agent — those rows show the quiet check. */
  installedSkillNames?: Set<string>;
}) {
  const { t } = useTranslation("skills");
  const library = useHoustonSkillLibraryData();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink-muted">
          {t("tabs.customEmptyDescription")}
        </p>
        <div className="flex items-center gap-2">
          <Button type="button" onClick={onCreateWithAi}>
            {t("tabs.createSkill")}
          </Button>
          <Button type="button" variant="outline" onClick={onAddClick}>
            <Plus className="size-4" />
            {t("grid.addSkill")}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <CatalogSectionHeader title={t("library.heading")} size="lg" />
        <HoustonSkillShelves
          groups={library.data ?? []}
          loading={library.isLoading}
          failed={library.isError}
          retry={() => void library.refetch()}
          install={onInstallLibrary}
          installing={installing}
          installedSkillNames={installedSkillNames}
        />
      </div>
    </div>
  );
}
