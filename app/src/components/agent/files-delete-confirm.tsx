import type { FileEntry } from "@houston-ai/agent";
import { ConfirmDialog } from "@houston-ai/core";
import { type ReactNode, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type DeleteTarget,
  deleteCopy,
  targetFiles,
} from "./files-delete-copy";

export function useFilesDeleteConfirm(
  onConfirm: (files: FileEntry[]) => void,
): {
  requestDelete: (file: FileEntry) => void;
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
