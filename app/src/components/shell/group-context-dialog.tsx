import {
  AsyncButton,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Name of the group whose shared context is being edited (dialog title). */
  groupName: string;
  /** The group's current shared context. */
  content: string;
  onSave: (content: string) => Promise<void> | void;
}

/**
 * Edits a sidebar group's shared context: prose injected into every member
 * agent's system prompt as `GROUP.md`. A controlled dialog with a textarea; the
 * draft resets to the group's current context each time the dialog opens so a
 * cancelled edit never leaks into the next one.
 */
export function GroupContextDialog({
  open,
  onOpenChange,
  groupName,
  content,
  onSave,
}: Props) {
  const { t } = useTranslation("shell");
  const [draft, setDraft] = useState(content);

  // Reseed the draft from the group's current context whenever the dialog
  // opens (a new target group, or the same one after external edits).
  useEffect(() => {
    if (open) setDraft(content);
  }, [open, content]);

  const handleSave = async () => {
    await onSave(draft);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("sidebar.groups.contextDialog.title", { name: groupName })}
          </DialogTitle>
          <DialogDescription>
            {t("sidebar.groups.contextDialog.description")}
          </DialogDescription>
        </DialogHeader>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t("sidebar.groups.contextDialog.placeholder")}
          rows={8}
          className="w-full rounded-md border border-line bg-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus resize-none"
          autoFocus
        />
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t("sidebar.groups.contextDialog.cancel")}
          </Button>
          <AsyncButton type="button" onClick={handleSave}>
            {t("sidebar.groups.contextDialog.save")}
          </AsyncButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
