import { ConfirmDialog } from "@houston-ai/core";
import type {
  InstalledSkillEditorState,
  SkillEditModalLabels,
} from "@houston-ai/skills";
import { SkillEditModal } from "@houston-ai/skills";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { skillDisplayTitle } from "../../lib/humanize-skill-name";
import { skillIntegrationSlugs } from "../../lib/skill-integrations";
import type { SkillSummary } from "../../lib/types";
import { IntegrationBadges } from "../integrations";

/** Copy for the two-step delete: the confirm dialog's title (named by skill),
 *  body, and confirm button. */
export interface DeleteConfirmLabels {
  title: (name: string) => string;
  description: string;
  confirmLabel: string;
}

/**
 * The installed skill's two modal surfaces: its edit modal (the one detail
 * surface, whose header names the apps the skill works with and whose footer
 * carries Save/Cancel and — outside read-only mode — the destructive Delete)
 * and the confirm-gated delete that Delete opens. Owns the
 * pending-delete handshake so the parent only supplies the open editor + the
 * mutations. In read-only mode the edit modal shows no Delete and the confirm
 * never opens.
 */
export function SkillEditorDialogs({
  editingSkill,
  editorState,
  readOnly,
  onCloseEdit,
  onSaveEditing,
  onDeleteSkill,
  editModalLabels,
  deleteConfirm,
}: {
  editingSkill: SkillSummary | null;
  editorState: InstalledSkillEditorState;
  readOnly: boolean;
  onCloseEdit: () => void;
  onSaveEditing: (content: string) => Promise<void>;
  onDeleteSkill: (name: string) => Promise<void>;
  editModalLabels: SkillEditModalLabels;
  deleteConfirm: DeleteConfirmLabels;
}) {
  const { t } = useTranslation("skills");
  const [pendingDelete, setPendingDelete] = useState<SkillSummary | null>(null);
  // Named badges rather than the bare logo pips the cards and rows carry: the
  // modal is the skill's ONE detail surface, so it has room to spell each app
  // out. Undefined when the skill declares none, so the header keeps its shape.
  const integrationSlugs = skillIntegrationSlugs(editingSkill?.integrations);

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
      <SkillEditModal
        open={editingSkill !== null}
        onOpenChange={(o) => {
          if (!o) onCloseEdit();
        }}
        displayName={editingSkill ? skillDisplayTitle(editingSkill) : ""}
        description={editingSkill?.description ?? ""}
        integrationsSlot={
          <IntegrationBadges
            toolkits={integrationSlugs}
            label={t("detail.integrations")}
          />
        }
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
