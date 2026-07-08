import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { SkillCard } from "../skill-card";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "Create it in chat" — may take a moment (starts a mission). */
  onChat: () => void;
  /** "Fill in the details myself" — opens the routine form. */
  onForm: () => void;
  /** Disables both options while the chat mission is starting. */
  busy?: boolean;
}

/**
 * The New-routine chooser: guided setup in chat, or the classic form.
 * Reuses the SkillCard option-card treatment from the New Mission picker.
 */
export function RoutineCreateChoiceDialog({
  open,
  onOpenChange,
  onChat,
  onForm,
  busy,
}: Props) {
  const { t } = useTranslation("routines");
  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("createChoice.title")}</DialogTitle>
          <DialogDescription>{t("createChoice.description")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <SkillCard
            image="speech-balloon"
            title={t("createChoice.chatTitle")}
            description={t("createChoice.chatDescription")}
            onClick={onChat}
            disabled={busy}
            busy={busy}
          />
          <SkillCard
            image="memo"
            title={t("createChoice.formTitle")}
            description={t("createChoice.formDescription")}
            onClick={onForm}
            disabled={busy}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
