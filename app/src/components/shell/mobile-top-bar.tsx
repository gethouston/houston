import { Menu, SquarePen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { startNewMission } from "../../lib/new-mission";
import { useUIStore } from "../../stores/ui";
import { useMobileHeaderSlotRef } from "./mobile-header-slot";
import { tourAnchor } from "./workspace-tour-steps";

const iconButtonClass =
  "flex size-10 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus";

/**
 * Compact header row shown only below md (the mobile layout, where the
 * sidebar rail is replaced by a drawer). Hidden with CSS rather than a JS
 * breakpoint so it appears instantly on resize with no re-render flicker.
 *
 * The middle is the phone's title slot: the active screen's `PageHeader`
 * portals its identity cluster here (`mobile-header-slot.tsx`), so the row
 * reads drawer, where you are, compose, and the screen card below opens on
 * its own content. Screens without a page header leave it empty.
 *
 * The trailing compose button is where a new mission starts on mobile — the
 * adopted IA keeps it out of the bottom tab bar on purpose (chat is never a
 * tab). It shares ⌘N's exact rule (`lib/new-mission.ts`): fire the board on
 * the glass, else navigate to the owning board and fire there.
 */
export function MobileTopBar() {
  const { t } = useTranslation("shell");
  const setMobileSidebarOpen = useUIStore((s) => s.setMobileSidebarOpen);
  const registerSlot = useMobileHeaderSlotRef();

  return (
    <div
      data-testid="mobile-top-bar"
      className="flex shrink-0 items-center gap-1 px-2 pt-2 md:hidden"
    >
      <button
        type="button"
        {...tourAnchor("mobileMenu")}
        aria-label={t("sidebar.openMenu")}
        onClick={() => setMobileSidebarOpen(true)}
        className={iconButtonClass}
      >
        <Menu className="size-5" />
      </button>
      <div
        ref={registerSlot}
        data-testid="mobile-top-bar-title"
        className="flex min-w-0 flex-1 items-center"
      />
      <button
        type="button"
        aria-label={t("sidebar.newMission")}
        onClick={startNewMission}
        className={iconButtonClass}
      >
        <SquarePen className="size-5" />
      </button>
    </div>
  );
}
