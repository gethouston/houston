import type { FileEntry } from "@houston-ai/agent";
import { ConfirmDialog } from "@houston-ai/core";
import { type ReactNode, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * "Move to Trash" confirmation for the Files tab. Deleting used to fire
 * straight off the context menu with no undo anywhere in the product, so a
 * mis-click on the wrong row silently destroyed the agent's work (HOU-970).
 *
 * The question is the same either way ("Move X to Trash?"); only the
 * consequence differs, so folders get their own DESCRIPTION: removing one
 * takes everything inside it, which the file wording would not warn about.
 * The dialog owns only the selection and its own visibility; the caller owns
 * the delete.
 *
 * Visibility and copy are deliberately separate state: the dialog keeps
 * rendering through its exit animation, so `target` outlives the close and the
 * title holds the filename all the way out instead of flipping to the
 * empty-name variant for the length of the fade.
 */
export function useFilesDeleteConfirm(onConfirm: (file: FileEntry) => void): {
  requestDelete: (file: FileEntry) => void;
  dialog: ReactNode;
} {
  const { t } = useTranslation("agents");
  const [target, setTarget] = useState<FileEntry | null>(null);
  const [open, setOpen] = useState(false);
  const requestDelete = useCallback((file: FileEntry) => {
    setTarget(file);
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);
  const isFolder = target?.is_directory === true;
  const name = target?.name ?? "";

  const dialog = (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title={t("files.delete.title", { name })}
      description={
        isFolder
          ? t("files.delete.folderDescription")
          : t("files.delete.fileDescription")
      }
      confirmLabel={t("files.delete.confirm")}
      cancelLabel={t("files.delete.cancel")}
      variant="destructive"
      onConfirm={() => {
        if (target) onConfirm(target);
        close();
      }}
    />
  );

  return { requestDelete, dialog };
}
