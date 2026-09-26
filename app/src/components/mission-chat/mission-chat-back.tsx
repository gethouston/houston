import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useUIStore } from "../../stores/ui";

/** The pushed chat's back chevron: pops the level, like hardware back. */
export function MissionChatBack() {
  const { t } = useTranslation("shell");
  const closeMissionChat = useUIStore((s) => s.closeMissionChat);
  return (
    <button
      type="button"
      data-testid="mission-chat-back"
      aria-label={t("missionChat.back")}
      onClick={closeMissionChat}
      className="flex size-9 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors active:scale-95 hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus"
    >
      <ChevronLeft className="size-5" />
    </button>
  );
}
