import { Button, ConfirmDialog, Spinner } from "@houston-ai/core";
import type {
  CommunitySkill,
  CommunitySkillPreview,
  InstalledSkillEditorState,
  InstalledSkillRowLabels,
  RepoSkill,
  SkillEditModalLabels,
} from "@houston-ai/skills";
import {
  AddSkillDialog,
  InstalledSkillRow,
  SkillEditModal,
  SkillMarketplaceSection,
} from "@houston-ai/skills";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { skillDisplayTitle } from "../../lib/humanize-skill-name";
import { resolveSkillImageUrl } from "../../lib/skill-image";
import type { SkillSummary } from "../../lib/types";
import {
  useSkillDialogLabels,
  useSkillMarketplaceSectionLabels,
} from "./use-skill-surface-labels";

interface DeleteConfirmLabels {
  title: (name: string) => string;
  description: string;
  confirmLabel: string;
}

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
  installedRowLabels,
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
   * not add/create/install any. Hides the add affordance and the marketplace.
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
  installedRowLabels: InstalledSkillRowLabels;
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
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner className="size-3.5" />
        {t("grid.loading")}
      </div>
    );
  }

  const addButton = addDialogProps && (
    <Button size="sm" onClick={() => setDialogOpen(true)} className="shrink-0">
      <Plus className="size-3.5" />
      {t("grid.addSkill")}
    </Button>
  );

  const marketplace =
    !readOnly && onSearch && onInstallCommunity ? (
      <SkillMarketplaceSection
        onSearch={onSearch}
        onInstall={onInstallCommunity}
        onPreview={onPreviewCommunity}
        installedSkillNames={installedSkillNames}
        labels={marketplaceLabels}
      />
    ) : null;

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
    <div className="flex flex-col gap-8">
      <section>
        <div className="mb-3 flex items-center justify-between gap-4">
          <p className="text-sm font-medium text-foreground">
            {t("grid.yourSkillsHeading")}
          </p>
          {addButton}
        </div>
        {sorted.length === 0 ? (
          <div className="rounded-xl bg-secondary px-6 py-8 text-center">
            <p className="text-sm font-medium text-foreground">
              {t("grid.emptyTitle")}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("grid.emptyDescription")}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {sorted.map((skill) => (
              <InstalledSkillRow
                key={skill.name}
                skill={{
                  name: skill.name,
                  title: skill.title,
                  description: skill.description,
                  image: skill.image,
                }}
                displayName={skillDisplayTitle(skill)}
                imageUrl={resolveSkillImageUrl(skill.image)}
                onEdit={() => onEditSkill(skill.name)}
                onDelete={() => setPendingDelete(skill)}
                labels={installedRowLabels}
              />
            ))}
          </div>
        )}
      </section>
      {marketplace}
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
    </div>
  );
}
