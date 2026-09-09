import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { openMobileTab } from "../../lib/open-mobile-tab";
import { useUIStore } from "../../stores/ui";
import { HoustonLogo } from "./houston-logo";

/**
 * The phone's header for the assistant chat: a back chevron, the product
 * mark, and the name. The desktop shows no header at all (the rail row names
 * the screen and wears the mark), so the strip is CSS-hidden at md+.
 *
 * On the phone the chat is a PUSH like the mission chat: the nav bar leaves
 * while it is up (`lib/mobile-tabs.ts` `phoneChromeHidden`), so this chevron
 * is the way out. It retreats to wherever the More menu was opened from; with
 * nothing behind it (a reload landing here) it goes home to the Agents tab
 * rather than dead-ending.
 */
export function AssistantPhoneHeader() {
  const { t } = useTranslation("assistant");
  const canGoBack = useUIStore((s) => s.navIndex > 0);
  const navBack = useUIStore((s) => s.navBack);
  const back = () => {
    if (canGoBack) navBack();
    else openMobileTab("agents");
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
      <HoustonLogo className="size-6" />
      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
        {t("title")}
      </p>
    </div>
  );
}
