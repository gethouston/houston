import { ManagerAvatar } from "@houston-ai/core";
import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { openAgentsTab } from "../../lib/open-mobile-tab";
import { useUIStore } from "../../stores/ui";

export function AssistantPhoneHeader() {
  const { t } = useTranslation("assistant");
  const canGoBack = useUIStore((s) => s.navIndex > 0);
  const navBack = useUIStore((s) => s.navBack);
  const back = () => {
    if (canGoBack) navBack();
    else openAgentsTab();
  };
  return (
    <div className="flex shrink-0 items-center gap-3 px-4 py-3 md:hidden">
      <button
        type="button"
        data-testid="assistant-back"
        aria-label={t("back")}
        onClick={back}
        className="flex size-9 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors active:scale-95 hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus"
      >
        <ChevronLeft className="size-5" />
      </button>
      <ManagerAvatar size={24} />
      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
        {t("title")}
      </p>
    </div>
  );
}
