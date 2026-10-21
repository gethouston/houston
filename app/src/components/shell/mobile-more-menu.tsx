import { Sheet, SheetContent, SheetTitle } from "@houston-ai/core";
import { SidebarWorkspaceSwitcher } from "@houston-ai/layout";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSurfaceGates } from "../../hooks/use-surface-gates";
import { openAdmin } from "../../lib/open-admin";
import { ACADEMY_VIEW_ID } from "../../lib/top-level-views";
import { useUIStore } from "../../stores/ui";
import { ConnectGroup } from "./connect-group";
import { MobileMoreAccountPage } from "./mobile-more-account";
import { MobileAccountRow, MobileMoreRowButton } from "./mobile-more-row";
import { PlanUpgradeRow } from "./plan-upgrade-row";
import { useAccountMenu } from "./sidebar-account-menu";
import { SidebarDialogs } from "./sidebar-dialogs";
import { academyNavRow, adminNavRow, settingsNavRow } from "./sidebar-nav-rows";
import { useSidebarNavigation } from "./use-sidebar-navigation";
import { useWorkspaceCreate, WorkspaceSwitchItems } from "./workspace-account";
import { useWorkspaceSwitcherFace } from "./workspace-switcher-face";

/**
 * The phone's "More": a floating card raised by the nav bar, holding the
 * desktop rail's foot. It is headed by the workspace switcher (whose menu,
 * headed by who is signed in, switches or creates a workspace: the rail keeps
 * the same choices in its account row's menu) and holds the rest of the
 * rail's destinations.
 *
 * A card and not a full bottom sheet, because it is a MENU: it answers "where
 * else can I go" and then gets out of the way, so it hovers over the bar that
 * raised it rather than taking the screen. It is a Radix dialog under the
 * restyle, so it isolates the app on its own while open.
 *
 * The destinations are the RAIL's, built by the same components and row
 * builders (`connect-group.tsx`, `sidebar-account-menu.tsx`,
 * `sidebar-nav-rows.tsx`), so the phone can never drift from the desktop on
 * what exists, what a gate hides, or which element a tour anchor names. They
 * navigate with `nav: "reset"`: reaching a destination from the menu is a
 * tab-level move, not a level pushed onto the tree the user was in.
 *
 * Under the switcher: the org's plan entry, then the connect group (apps, then AI behind
 * `showAiModels`), as at the rail's foot; then the account row opening the
 * person's menu, Admin behind the org gate, the Academy and Settings, which
 * the rail keeps inside its account menu and the card has the room to show
 * as rows. Every row is the card's own 48px row (`sheet`), its content on one
 * 16px left edge at one 16px type size.
 */
export function MobileMoreMenu() {
  const { t } = useTranslation(["shell", "common", "teams"]);
  const { showOrganization } = useSurfaceGates();
  const open = useUIStore((s) => s.mobileMoreOpen);
  const setMobileMoreOpen = useUIStore((s) => s.setMobileMoreOpen);
  // "Your account" drills in inside the card; reopening starts at its root.
  const [page, setPage] = useState<"root" | "account">("root");
  // Back from the account page hands focus to the row that opened it.
  const accountRow = useRef<HTMLButtonElement>(null);
  const backFromAccount = useRef(false);
  useEffect(() => {
    if (page !== "root" || !backFromAccount.current) return;
    backFromAccount.current = false;
    accountRow.current?.focus();
  }, [page]);
  const setOpen = useCallback(
    (next: boolean) => {
      if (!next) setPage("root");
      setMobileMoreOpen(next);
    },
    [setMobileMoreOpen],
  );
  const openSettings = useUIStore((s) => s.openSettings);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const close = useCallback(() => setOpen(false), [setOpen]);
  const [createWsOpen, setCreateWsOpen] = useState(false);
  const face = useWorkspaceSwitcherFace();
  const create = useWorkspaceCreate(() => setCreateWsOpen(true));

  const academy = academyNavRow({
    label: t("shell:sidebar.academy"),
    onOpen: () => {
      setViewMode(ACADEMY_VIEW_ID, { nav: "reset" });
      close();
    },
  });
  const admin = adminNavRow({
    label: t("shell:sidebar.admin"),
    onOpen: () => openAdmin({ nav: "reset" }),
  });
  const settings = settingsNavRow({
    label: t("shell:sidebar.settings"),
    onOpen: () => {
      openSettings(null, { nav: "reset" });
      close();
    },
  });
  const account = useAccountMenu({ nav: "reset", onNavigate: close });
  const { switchWorkspace } = useSidebarNavigation({
    closeMobileMenu: close,
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
          {page === "account" ? (
            <MobileMoreAccountPage
              account={account}
              onBack={() => {
                backFromAccount.current = true;
                setPage("root");
              }}
            />
          ) : (
            <>
              {/* Every row is a sheet row: one 16px left edge, one 16px type
              size, 48px tall, whichever component draws it. */}
              <div className="pt-2">
                <SidebarWorkspaceSwitcher
                  title={face.title}
                  header={face.header}
                  dataAttrs={{ "data-testid": "more-workspace-switcher" }}
                >
                  <WorkspaceSwitchItems
                    onSwitch={switchWorkspace}
                    createLabel={create.label}
                    onCreate={() => {
                      // The create dialog stands on its own: the card steps aside.
                      close();
                      create.onCreate();
                    }}
                  />
                </SidebarWorkspaceSwitcher>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto pb-2">
                <PlanUpgradeRow surface="sheet" nav="reset" />
                <div className="pb-2">
                  <ConnectGroup
                    collapsed={false}
                    surface="sheet"
                    nav="reset"
                    onNavigate={close}
                  />
                </div>
                <div className="border-line border-t">
                  <MobileAccountRow
                    label={account.label}
                    avatar={account.avatar}
                    onOpen={() => setPage("account")}
                    ref={accountRow}
                  />
                  {showOrganization && <MobileMoreRowButton row={admin} />}
                  <MobileMoreRowButton row={academy} />
                  <MobileMoreRowButton row={settings} />
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
      {/* Outside the sheet on purpose: picking "Create workspace" closes the
          menu, and a dialog mounted inside it would unmount with it. */}
      <SidebarDialogs
        createWorkspaceOpen={createWsOpen}
        onCreateWorkspaceOpenChange={setCreateWsOpen}
      />
      {create.dialog}
    </>
  );
}
