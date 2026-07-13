import {
  Button,
  CatalogShell,
  type CatalogShellTab,
  ConfirmDialog,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Spinner,
} from "@houston-ai/core";
import type {
  CommunitySkill,
  CommunitySkillPreview,
  InstalledSkillEditorState,
  RepoSkill,
  SkillEditModalLabels,
} from "@houston-ai/skills";
import {
  AddSkillDialog,
  SkillEditModal,
  SkillMarketplaceSection,
} from "@houston-ai/skills";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { skillDisplayTitle } from "../../lib/humanize-skill-name";
import { resolveSkillImageUrl } from "../../lib/skill-image";
import type { SkillSummary } from "../../lib/types";
import { InstalledSkillTile } from "./installed-skill-tile";
import {
  useSkillDialogLabels,
  useSkillMarketplaceSectionLabels,
} from "./use-skill-surface-labels";

interface DeleteConfirmLabels {
  title: (name: string) => string;
  description: string;
  confirmLabel: string;
}

/**
 * The Skills tab body in the shared catalog grammar (the same layout as the
 * Integrations surfaces, minus a page header — the tab label carries that):
 * the consolidated **Your skills** strip of installed-skill tiles OUTSIDE the
 * tabs (a tile opens the edit modal, whose footer carries the delete), then
 * two discovery tabs via {@link CatalogShell} — **Store** (the skills.sh
 * marketplace section, with its own search + category controls) and **Custom
 * skills** (an empty state for now: the explanation + the Add CTA opening the
 * GitHub / From-scratch dialog). Read-only mode (managed agent, non-manager)
 * drops the tabs entirely and keeps just the strip.
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
  const marketplaceLabels = useSkillMarketplaceSectionLabels();
  const [tab, setTab] = useState("store");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<SkillSummary | null>(null);
  const sorted = useMemo(
    () => [...skills].sort((a, b) => a.name.localeCompare(b.name)),
    [skills],
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

  if (loading && sorted.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-ink-muted">
        <Spinner className="size-3.5" />
        {t("grid.loading")}
      </div>
    );
  }

  const installed = sorted.length > 0 && (
    <div className="flex flex-wrap gap-3">
      {sorted.map((skill) => (
        <InstalledSkillTile
          key={skill.name}
          displayName={skillDisplayTitle(skill)}
          imageUrl={resolveSkillImageUrl(skill.image)}
          onOpen={() => onEditSkill(skill.name)}
        />
      ))}
    </div>
  );

  const tabs: CatalogShellTab[] = [
    ...(!readOnly && onSearch && onInstallCommunity
      ? [
          {
            value: "store",
            label: t("tabs.store"),
            content: (
              <SkillMarketplaceSection
                onSearch={onSearch}
                onInstall={onInstallCommunity}
                onPreview={onPreviewCommunity}
                installedSkillNames={installedSkillNames}
                labels={marketplaceLabels}
              />
            ),
          },
        ]
      : []),
    ...(addDialogProps
      ? [
          {
            value: "custom",
            label: t("tabs.custom"),
            content: (
              <Empty className="py-16">
                <EmptyHeader>
                  <EmptyTitle className="text-lg">
                    {t("tabs.customEmptyTitle")}
                  </EmptyTitle>
                  <EmptyDescription>
                    {t("tabs.customEmptyDescription")}
                  </EmptyDescription>
                </EmptyHeader>
                <Button type="button" onClick={() => setDialogOpen(true)}>
                  <Plus className="size-4" />
                  {t("grid.addSkill")}
                </Button>
              </Empty>
            ),
          },
        ]
      : []),
  ];

  // The delete mutation surfaces its own error toast via the `call` wrapper, so
  // the row action stays quiet on failure; catch here only to keep the
  // fire-and-forget confirm from becoming an unhandled rejection.
  const confirmDelete = () => {
    const skill = pendingDelete;
    setPendingDelete(null);
    if (skill)
      void onDeleteSkill(skill.name).catch(() => {
        // Error already surfaced to the user by the delete mutation's `call`
        // toast; swallow here only to avoid an unhandled promise rejection.
      });
  };

  return (
    <>
      {/* Read-only mode yields zero tabs: the shell then renders only the
          installed strip (or nothing at all when there are no skills). */}
      <CatalogShell
        installedTitle={t("grid.yourSkillsHeading")}
        installedCount={sorted.length}
        installed={installed || undefined}
        tabs={tabs}
        value={tab}
        onValueChange={setTab}
      />
      {addDialogProps && (
        <AddSkillDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          {...addDialogProps}
          labels={dialogLabels}
        />
      )}
      <SkillEditModal
        open={editingSkill !== null}
        onOpenChange={(o) => {
          if (!o) onCloseEdit();
        }}
        displayName={editingSkill ? skillDisplayTitle(editingSkill) : ""}
        description={editingSkill?.description ?? ""}
        editor={editorState}
        onSave={onSaveEditing}
        onDelete={
          readOnly || !editingSkill
            ? undefined
            : () => {
                setPendingDelete(editingSkill);
                onCloseEdit();
              }
        }
        labels={editModalLabels}
      />
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => {
          if (!o) setPendingDelete(null);
        }}
        title={
          pendingDelete
            ? deleteConfirm.title(skillDisplayTitle(pendingDelete))
            : ""
        }
        description={deleteConfirm.description}
        confirmLabel={deleteConfirm.confirmLabel}
        onConfirm={confirmDelete}
      />
    </>
  );
}
