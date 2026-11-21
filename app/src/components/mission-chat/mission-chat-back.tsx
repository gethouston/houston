import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useUIStore } from "../../stores/ui";

export function MissionChatBack() {
  const { t } = useTranslation("shell");
  const closeMissionChat = useUIStore((s) => s.closeMissionChat);
  return (
    <button
      type="button"
      data-testid="mission-chat-back"
      aria-label={t("missionChat.back")}
      onClick={closeMissionChat}
      className="relative flex size-9 shrink-0 items-center justify-center rounded-full text-ink-muted transition-[color,background-color,scale] active:scale-[0.96] md:transition-colors md:active:scale-95 hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus after:absolute after:-inset-1 md:after:hidden"
    >
      <ChevronLeft className="size-5" />
    </button>
  );
}
