import { Sheet, SheetContent, SheetTitle } from "@houston-ai/core";
import { WorkspaceSwitcher } from "@houston-ai/layout";
import { Settings } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRunGuidedSetup } from "../../hooks/use-run-guided-setup";
import { useTeams } from "../../hooks/use-teams";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";
import { mobileMoreFooterRows, mobileMoreItems } from "./mobile-more-items";
import {
  MobileMoreActionRow,
  MobileMoreBand,
  MobileMoreRowButton,
} from "./mobile-more-row";
import { SidebarDialogs } from "./sidebar-dialogs";
import { useSidebarNavItems } from "./use-sidebar-nav-items";
import { useSidebarNavigation } from "./use-sidebar-navigation";
import { tourAnchor } from "./workspace-tour-steps";

/**
 * The phone's "More": a floating card raised by the nav bar, holding the
 * workspace switcher, the long tail of destinations and the help actions.
 *
 * A card and not a full bottom sheet, because it is a MENU — it answers "where
 * else can I go" and then gets out of the way, so it hovers over the bar that
 * raised it rather than taking the screen. It is still a Radix dialog under
 * the restyle, which is load-bearing: the guided setup rings its rows in the
 * `inDialog` mode (`in-app-mobile-spotlight.tsx`), and that mode exists
 * because a dialog isolates the app on its own.
 *
 * The destinations are the RAIL's (`useSidebarNavItems`), so the phone can
 * never drift from the desktop on what exists, what a gate hides, or which
 * element a tour anchor names. They navigate with `nav: "reset"`: reaching a
 * destination from the menu is a tab-level move, not a level pushed onto the
 * tree the user was in.
 */
export function MobileMoreMenu() {
  const { t } = useTranslation([
    "shell",
    "common",
    "teams",
    "dashboard",
    "settings",
  ]);
  const open = useUIStore((s) => s.mobileMoreOpen);
  const setOpen = useUIStore((s) => s.setMobileMoreOpen);
  const openSettings = useUIStore((s) => s.openSettings);
  const close = useCallback(() => setOpen(false), [setOpen]);
  const runGuidedSetup = useRunGuidedSetup();
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const [createWsOpen, setCreateWsOpen] = useState(false);

  const { navSections } = useSidebarNavItems(t, close, {
    nav: "reset",
    unfolded: true,
  });
  const groups = mobileMoreItems(navSections);
  const { switchWorkspace } = useSidebarNavigation({
    teams: useTeams(),
    closeMobileMenu: close,
  });
  const footerRows = mobileMoreFooterRows({
    guideMe: t("shell:sidebar.guideMe"),
    reportProblem: t("shell:sidebar.reportProblem"),
    // One tick AFTER the menu closes, for the same reason the rail's help
    // menu defers: Radix restores focus to the trigger as its content
    // unmounts, and a handler that mounts an overlay first gets that focus
    // yanked back.
    onGuideMe: () => {
      close();
      setTimeout(runGuidedSetup, 0);
    },
    onReportProblem: () => {
      // The one bug-report surface, reached from where the user is standing
      // when something goes wrong rather than duplicated here.
      openSettings("reportBug", { nav: "reset" });
      close();
    },
  });

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          data-testid="mobile-more-menu"
          showCloseButton={false}
          aria-describedby={undefined}
          className="inset-x-3 bottom-[calc(env(safe-area-inset-bottom)_+_5.5rem)] max-h-[70dvh] gap-0 rounded-3xl border-0 border-t-0 bg-popover p-0"
        >
          <SheetTitle className="sr-only">
            {t("shell:moreMenu.title")}
          </SheetTitle>
          <div className="flex items-center gap-1 pr-2">
            <div className="min-w-0 flex-1">
              <WorkspaceSwitcher
                workspaces={workspaces}
                currentId={currentWorkspace?.id ?? null}
                currentName={
                  currentWorkspace?.name ?? t("shell:sidebar.selectWorkspace")
                }
                onSwitch={switchWorkspace}
                onCreate={() => {
                  close();
                  setCreateWsOpen(true);
                }}
                collapsed={false}
                createLabel={t("shell:sidebar.createWorkspace")}
              />
            </div>
            <button
              type="button"
              aria-label={t("shell:sidebar.settings")}
              {...tourAnchor("nav-settings")}
              onClick={() => {
                // Settings opens on its INDEX, never a leftover section.
                openSettings(null, { nav: "reset" });
                close();
              }}
              className="flex size-10 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors active:scale-[0.96] hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <Settings className="size-5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pb-2">
            {groups.map((group, index) => (
              <div
                key={group.id}
                className={index === 0 ? undefined : "border-line border-t"}
              >
                {group.label && <MobileMoreBand label={group.label} />}
                {group.items.map((row) => (
                  <MobileMoreRowButton key={row.id} row={row} />
                ))}
              </div>
            ))}
            <div className="border-line border-t">
              <MobileMoreBand label={t("shell:moreMenu.help")} />
              {footerRows.map((row) => (
                <MobileMoreActionRow
                  key={row.id}
                  label={row.label}
                  onSelect={row.onSelect}
                />
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>
      {/* Outside the sheet on purpose: picking "Create workspace" closes the
          menu, and a dialog mounted inside it would unmount with it. */}
      <SidebarDialogs
        createWorkspaceOpen={createWsOpen}
        onCreateWorkspaceOpenChange={setCreateWsOpen}
      />
    </>
  );
}
