import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
} from "@houston-ai/core";
import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import type { InstalledSkillEditorState } from "./installed-skill-editor-model";
import {
  DEFAULT_SKILL_EDIT_MODAL_LABELS,
  type SkillEditModalLabels,
} from "./skill-edit-modal-labels";
import { NonReadyBody, ReadyEditBody } from "./skill-edit-modal-parts";
import {
  EditableSkillTitle,
  skillRenameEscapeGuard,
} from "./skill-title-editor";

export interface SkillEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Localized display title, shown as the dialog title. */
  displayName: string;
  /** One-line skill description, shown muted under the title (may be empty). */
  description: string;
  /**
   * The connected apps this skill works with, rendered under the description.
   * A node rather than slugs: resolving a toolkit slug to a real name and logo
   * is a Composio-catalog concern that belongs to the app, not to this
   * props-only package. A node that renders `null` for an empty list is fine —
   * the header is a flex column, so a DOM-less child opens no gap.
   */
  integrationsSlot?: ReactNode;
  editor: InstalledSkillEditorState;
  /** `rename` is the header pencil's committed display name, riding the same
   *  save (the caller writes it into the frontmatter `title:`). */
  onSave: (content: string, rename?: string) => Promise<void>;
  /** Open the delete confirm (the strip has no per-tile delete affordance, so
   *  the destructive action lives here). Omit to hide the button. */
  onDelete?: () => void;
  labels?: SkillEditModalLabels;
}

/**
 * SkillEditModal — the overlay editor for an installed skill, mirroring
 * {@link SkillPreviewModal}. The header shows the skill's display name, a muted
 * one-line description, and the apps it works with; the body holds the editor
 * content states (loading skeleton, a non-blocking load-error note, or a roomy
 * monospace textarea seeded from the loaded markdown); the footer carries
 * Cancel (ghost) and Save changes (primary pill, disabled until dirty,
 * "Saving..." while in flight). A successful save closes the modal from the
 * parent (clearing the editing skill); a save rejection propagates to the
 * caller's toast path (never swallowed).
 */
export function SkillEditModal({
  open,
  onOpenChange,
  displayName,
  description,
  integrationsSlot,
  editor,
  onSave,
  onDelete,
  labels,
}: SkillEditModalProps) {
  const l = { ...DEFAULT_SKILL_EDIT_MODAL_LABELS, ...labels };
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  // The header pencil's uncommitted rename; saved alongside the content draft,
  // dropped whenever the modal closes or shows a different skill.
  const [rename, setRename] = useState<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: open and displayName are intentional change-triggers — a pending rename must die when the modal closes or shows a different skill; the effect body deliberately reads none of it.
  useEffect(() => {
    setRename(null);
  }, [open, displayName]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-2xl"
        onEscapeKeyDown={skillRenameEscapeGuard}
      >
        {/* min-w-0: DialogContent is a grid; without it this item's min-content
            width (a long nowrap line) blows the track past the dialog's
            max-width and drags the textarea with it. */}
        <DialogHeader className="min-w-0">
          <EditableSkillTitle
            title={rename ?? displayName}
            onRename={editor.status === "ready" ? setRename : undefined}
            renameLabel={l.rename}
          />
          {description && (
            <DialogDescription className="line-clamp-2">
              {description}
            </DialogDescription>
          )}
          {integrationsSlot}
        </DialogHeader>

        {editor.status === "ready" ? (
          <ReadyEditBody
            initial={editor.content}
            rename={rename}
            onSave={onSave}
            onCancel={close}
            onDelete={onDelete}
            labels={l}
          />
        ) : (
          <NonReadyBody
            status={editor.status}
            onCancel={close}
            onDelete={onDelete}
            labels={l}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
