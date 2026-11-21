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

export function MobileMoreMenu() {
  const { t } = useTranslation(["shell", "common", "teams"]);
  const { showOrganization } = useSurfaceGates();
  const open = useUIStore((s) => s.mobileMoreOpen);
  const setMobileMoreOpen = useUIStore((s) => s.setMobileMoreOpen);
  const [page, setPage] = useState<"root" | "account">("root");
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
      <SidebarDialogs
        createWorkspaceOpen={createWsOpen}
        onCreateWorkspaceOpenChange={setCreateWsOpen}
      />
      {create.dialog}
    </>
  );
}
