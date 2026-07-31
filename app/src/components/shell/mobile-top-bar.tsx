import { Menu } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useUIStore } from "../../stores/ui";

/**
 * Compact header row shown only below md (the mobile layout, where the
 * sidebar rail is replaced by a drawer). Hidden with CSS rather than a JS
 * breakpoint so it appears instantly on resize with no re-render flicker.
 */
export function MobileTopBar() {
  const { t } = useTranslation("shell");
  const setMobileSidebarOpen = useUIStore((s) => s.setMobileSidebarOpen);

  return (
    <div className="flex shrink-0 items-center gap-2 px-2 pt-2 md:hidden">
      <button
        type="button"
        aria-label={t("sidebar.openMenu")}
        onClick={() => setMobileSidebarOpen(true)}
        className="flex size-10 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus"
      >
        <Menu className="size-5" />
      </button>
    </div>
  );
}
