/**
 * Shown when a drag-move would land on an existing name: offer Replace
 * (delete the occupant, then move) or Keep both (move under a "name (n)"),
 * instead of surfacing the host's 409 as an error toast.
 */
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { useTranslation } from "react-i18next";

interface Props {
  /** The colliding file/folder name, or null when the dialog is closed. */
  name: string | null;
  onReplace: () => void;
  onKeepBoth: () => void;
  onCancel: () => void;
}

export function MoveConflictDialog({
  name,
  onReplace,
  onKeepBoth,
  onCancel,
}: Props) {
  const { t } = useTranslation("agents");
  return (
    <Dialog open={name !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("files.conflict.title", { name: name ?? "" })}
          </DialogTitle>
          <DialogDescription>
            {t("files.conflict.description", { name: name ?? "" })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t("files.conflict.cancel")}
          </Button>
          <Button type="button" variant="secondary" onClick={onKeepBoth}>
            {t("files.conflict.keepBoth")}
          </Button>
          <Button type="button" variant="destructive" onClick={onReplace}>
            {t("files.conflict.replace")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
