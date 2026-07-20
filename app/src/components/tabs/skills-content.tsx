import { CatalogSearchField, CatalogShell, Spinner } from "@houston-ai/core";
import type {
  CommunitySkill,
  CommunitySkillPreview,
  InstalledSkillEditorState,
  RepoSkill,
  SkillEditModalLabels,
} from "@houston-ai/skills";
import { AddSkillDialog } from "@houston-ai/skills";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { SkillSummary } from "../../lib/types";
import { useInstalledSkillsStrip } from "./installed-skills-strip";
import { useSkillDiscoveryTabs } from "./skill-discovery-tabs";
import {
  type DeleteConfirmLabels,
  SkillEditorDialogs,
} from "./skill-editor-dialogs";
import { useSkillDialogLabels } from "./use-skill-surface-labels";

/** Approximate size of the skills.sh store, shown verbatim on the Available chip
 * (the store is async with no cheap total, so we label the ballpark). */
const SKILL_STORE_SIZE_LABEL = "9000+";

/**
 * The Skills tab body in the shared catalog grammar (the same layout as the
 * Integrations surfaces, minus a page header — the tab label carries that):
 * ONE search field on top drives everything, over the consolidated **Your
 * skills** strip of installed-skill tiles (a tile opens the edit modal, whose
 * footer carries the delete), then the **Available** discovery area via
 * {@link CatalogShell} — the **Store** tab (the skills.sh marketplace, its
 * category picker kept) and **Custom skills** (an empty state for now: the
 * explanation + the Add CTA opening the GitHub / From-scratch dialog). The one
 * query filters the strip AND the store; a strip with no matches is dropped.
 * Read-only mode (managed agent, non-manager) drops the tabs entirely and keeps
 * just the strip.
 */
export function SkillsContent({
  skills,
  loading,
  readOnly = false,
  editingSkillName,
  editorState,
  onEditSkill,
  onCloseEdit,
  onSaveEditing,
  onDeleteSkill,
  editModalLabels,
  deleteConfirm,
  onSearch,
  onInstallCommunity,
  onPreviewCommunity,
  onListFromRepo,
  onInstallFromRepo,
  onCreateFromScratch,
  installedSkillNames,
}: {
  skills: SkillSummary[];
  loading: boolean;
  /**
   * Managed-agent read-only mode (matrix v2): a non-manager may view skills but
   * not add/create/install any. Hides the discovery tabs and the add CTA.
   * The gateway 403s writes regardless.
   */
  readOnly?: boolean;
  /** Name of the installed skill whose edit modal is open, if any. */
  editingSkillName: string | null;
  editorState: InstalledSkillEditorState;
  onEditSkill: (name: string) => void;
  onCloseEdit: () => void;
  onSaveEditing: (content: string) => Promise<void>;
  onDeleteSkill: (name: string) => Promise<void>;
  editModalLabels: SkillEditModalLabels;
  deleteConfirm: DeleteConfirmLabels;
  onSearch?: (query: string, signal?: AbortSignal) => Promise<CommunitySkill[]>;
  onInstallCommunity?: (
    skill: CommunitySkill,
    signal?: AbortSignal,
  ) => Promise<string>;
  onPreviewCommunity?: (
    skill: CommunitySkill,
    signal?: AbortSignal,
  ) => Promise<CommunitySkillPreview>;
  onListFromRepo?: (source: string) => Promise<RepoSkill[]>;
  onInstallFromRepo?: (
    source: string,
    skills: RepoSkill[],
  ) => Promise<string[]>;
  onCreateFromScratch?: (input: {
    name: string;
    description: string;
    content: string;
  }) => Promise<string>;
  installedSkillNames?: Set<string>;
}) {
  const { t } = useTranslation("skills");
  const dialogLabels = useSkillDialogLabels();
  const [tab, setTab] = useState("store");
  const [dialogOpen, setDialogOpen] = useState(false);
  // The ONE page search: it filters the installed strip AND drives the Store.
  const [query, setQuery] = useState("");
  const { sorted, installedCount, installed } = useInstalledSkillsStrip(
    skills,
    onEditSkill,
    query,
  );
  const editingSkill = sorted.find((s) => s.name === editingSkillName) ?? null;
  const addDialogProps =
    !readOnly && onCreateFromScratch
      ? {
          onListFromRepo,
          onInstallFromRepo,
          onCreateFromScratch,
          installedSkillNames,
        }
      : null;
  const tabs = useSkillDiscoveryTabs({
    showCustom: addDialogProps !== null,
    onAddClick: () => setDialogOpen(true),
    query,
    onQueryChange: setQuery,
    // Read-only mode never offers the Store either: no community callbacks.
    onSearch: readOnly ? undefined : onSearch,
    onInstallCommunity: readOnly ? undefined : onInstallCommunity,
    onPreviewCommunity,
    installedSkillNames,
  });

  // Read-only surfaces render zero tabs, so an active search that matches no
  // installed skill would leave nothing at all under the search box — a blank
  // void. This note keeps the search field anchored to a visible result.
  const noInstalledMatches =
    tabs.length === 0 && query.trim() !== "" && installedCount === 0;

  if (loading && sorted.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-ink-muted">
        <Spinner className="size-3.5" />
        {t("grid.loading")}
      </div>
    );
  }

  return (
    <>
      {/* Read-only mode yields zero tabs: the shell then renders only the
          installed strip (or nothing at all when there are no skills). */}
      <CatalogShell
        controls={
          (tabs.length > 0 || sorted.length > 0) && (
            <CatalogSearchField
              value={query}
              onChange={setQuery}
              label={t("grid.searchSkills")}
            />
          )
        }
        installedTitle={t("grid.yourSkillsHeading")}
        installedCount={installedCount}
        installed={installed}
        availableTitle={t("grid.availableHeading")}
        // The store-size label belongs to the Store tab only; on Custom the
        // chip would contradict the visible content.
        availableCount={tab === "store" ? SKILL_STORE_SIZE_LABEL : undefined}
        tabs={tabs}
        value={tab}
        onValueChange={setTab}
      />
      {noInstalledMatches && (
        <p className="text-[13px] text-ink-muted">
          {t("grid.noMatchingSkills")}
        </p>
      )}
      {addDialogProps && (
        <AddSkillDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          {...addDialogProps}
          labels={dialogLabels}
        />
      )}
      <SkillEditorDialogs
        editingSkill={editingSkill}
        editorState={editorState}
        readOnly={readOnly}
        onCloseEdit={onCloseEdit}
        onSaveEditing={onSaveEditing}
        onDeleteSkill={onDeleteSkill}
        editModalLabels={editModalLabels}
        deleteConfirm={deleteConfirm}
      />
    </>
  );
}
