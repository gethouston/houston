import type { FileEntry } from "@houston-ai/agent";
import { ConfirmDialog } from "@houston-ai/core";
import { type ReactNode, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type DeleteTarget,
  deleteCopy,
  targetFiles,
} from "./files-delete-copy";

/**
 * "Move to Trash" confirmation for the Files tab. Deleting used to fire
 * straight off the context menu with no undo anywhere in the product, so a
 * mis-click on the wrong row silently destroyed the agent's work (HOU-970).
 *
 * One dialog, two copies (which words go with which target is decided by
 * `deleteCopy` in files-delete-copy.ts). The dialog owns only the target and
 * its own visibility; the caller owns the delete.
 *
 * Visibility and copy are deliberately separate state: the dialog keeps
 * rendering through its exit animation, so `target` outlives the close and the
 * copy holds its name or count all the way out instead of flipping to the
 * empty variant for the length of the fade.
 */
export function useFilesDeleteConfirm(
  onConfirm: (files: FileEntry[]) => void,
): {
  /** Kebab / context-menu delete: the dialog NAMES the file or folder. */
  requestDelete: (file: FileEntry) => void;
  /** Selection-bar delete: the dialog COUNTS the items. */
  requestDeleteMany: (files: FileEntry[]) => void;
  dialog: ReactNode;
} {
  const { t } = useTranslation("agents");
  const [target, setTarget] = useState<DeleteTarget | null>(null);
  const [open, setOpen] = useState(false);
  const requestDelete = useCallback((file: FileEntry) => {
    setTarget({ kind: "single", file });
    setOpen(true);
  }, []);
  const requestDeleteMany = useCallback((files: FileEntry[]) => {
    // An empty selection has nothing to confirm, and "Move 0 items to Trash?"
    // is not a question worth asking.
    if (files.length === 0) return;
    setTarget({ kind: "batch", files });
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);
  const copy = deleteCopy(target, t);

  const dialog = (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title={copy.title}
      description={copy.description}
      confirmLabel={t("files.delete.confirm")}
      cancelLabel={t("files.delete.cancel")}
      variant="destructive"
      onConfirm={() => {
        if (target) onConfirm(targetFiles(target));
        close();
      }}
    />
  );

  return { requestDelete, requestDeleteMany, dialog };
}
