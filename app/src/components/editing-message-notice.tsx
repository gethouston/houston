import { Pencil, X } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * The composer banner shown while the user edits a previous message
 * (PRODUCT-1217): names the state, says what sending will do (rewind the chat
 * to that point), and offers the cancel escape. Chrome mirrors
 * SelectedSkillChip so the two composer-header cards read as one family.
 */
export function EditingMessageNotice({ onCancel }: { onCancel: () => void }) {
  const { t } = useTranslation("chat");
  return (
    <div className="flex w-full items-start gap-2 rounded-2xl bg-chip/70 px-2.5 py-2 text-left">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-line-input">
        <Pencil className="size-4 text-ink-muted" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-ink">
          {t("editMessage.editing")}
        </div>
        <p className="text-xs leading-relaxed text-ink-muted">
          {t("editMessage.hint")}
        </p>
      </div>
      <button
        type="button"
        onClick={onCancel}
        aria-label={t("editMessage.cancel")}
        className="flex size-7 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-hover hover:text-ink"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
