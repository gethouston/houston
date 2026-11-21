import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

export function RoutineSetupChatClose({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation("routines");
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={t("chat.close")}
      className="size-7 flex items-center justify-center rounded-md text-ink-muted hover:text-ink hover:bg-hover/50 transition-colors shrink-0"
    >
      <X className="size-4" strokeWidth={1.75} />
    </button>
  );
}
