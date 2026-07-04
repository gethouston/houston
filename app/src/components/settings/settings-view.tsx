import { Spinner } from "@houston-ai/core";
import {
  Bug,
  FileText,
  Folder,
  Keyboard,
  User,
  UserCircle,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../../hooks/use-capabilities";
import { canSeeMembers } from "../../lib/org-roles";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";
import {
  type SidebarSectionItem,
  SidebarSectionNav,
} from "../shared/sidebar-section-nav";

type SettingsSectionId =
  | "account"
  | "members"
  | "workspace"
  | "workspaceContext"
  | "userContext"
  | "phone"
  | "shortcuts"
  | "reportBug";

import { AccountSection, useAccountAvailable } from "./sections/account";
import { AppearanceSection } from "./sections/appearance";
import { ConnectPhoneSection } from "./sections/connect-phone";
import { DangerSection } from "./sections/danger";
import { LanguageSection } from "./sections/language";
import { MembersSection } from "./sections/members";
import { ReportBugSection } from "./sections/report-bug";
import { ShortcutsSection } from "./sections/shortcuts";
import { WorkspaceSection } from "./sections/workspace";
import {
  UserContextSection,
  WorkspaceContextSection,
} from "./sections/workspace-context";

export function SettingsView() {
  const { t } = useTranslation(["settings", "common", "org"]);
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const accountAvailable = useAccountAvailable();
  const { capabilities } = useCapabilities();
  const showMembers = canSeeMembers(capabilities);
  const addToast = useUIStore((s) => s.addToast);

  async function handleVersionClick() {
    try {
      await navigator.clipboard.writeText(__APP_VERSION__);
      addToast({ title: t("settings:toasts.versionCopied") });
    } catch (err) {
      addToast({
        title: t("settings:toasts.versionCopyFailed"),
        description: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
    }
  }

  const items = useMemo<SidebarSectionItem<SettingsSectionId>[]>(() => {
    const list: SidebarSectionItem<SettingsSectionId>[] = [];
    if (accountAvailable) {
      list.push({
        id: "account",
        label: t("settings:nav.account"),
        icon: User,
      });
    }
    if (showMembers) {
      list.push({
        id: "members",
        label: t("org:members.navLabel"),
        icon: Users,
      });
    }
    list.push(
      { id: "workspace", label: t("settings:nav.workspace"), icon: Folder },
      {
        id: "workspaceContext",
        label: t("settings:nav.workspaceContext"),
        icon: FileText,
      },
      {
        id: "userContext",
        label: t("settings:nav.userContext"),
        icon: UserCircle,
      },
      { id: "shortcuts", label: t("settings:nav.shortcuts"), icon: Keyboard },
      { id: "reportBug", label: t("settings:nav.reportBug"), icon: Bug },
    );
    return list;
  }, [accountAvailable, showMembers, t]);

  const [active, setActive] = useState<SettingsSectionId>(
    accountAvailable ? "account" : "workspace",
  );

  if (!currentWorkspace) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner className="h-5 w-5" />
      </div>
    );
  }

  // If the active id was hidden (e.g., signed out), fall back to a visible one.
  const activeVisible = items.some((i) => i.id === active)
    ? active
    : items[0].id;

  return (
    <div className="flex-1 flex min-h-0">
      <SidebarSectionNav
        ariaLabel={t("settings:title")}
        items={items}
        active={activeVisible}
        onSelect={setActive}
        footer={
          <button
            type="button"
            onClick={() => void handleVersionClick()}
            className="text-xs text-muted-foreground px-2.5 hover:text-foreground transition-colors cursor-pointer"
          >
            {t("settings:version", { version: __APP_VERSION__ })}
          </button>
        }
      />
      <div className="flex-1 overflow-y-auto">
        {activeVisible === "workspaceContext" ? (
          <WorkspaceContextSection />
        ) : activeVisible === "userContext" ? (
          <UserContextSection />
        ) : (
          <div className="mx-auto max-w-xl px-8 py-10">
            {activeVisible === "account" && <AccountSection />}
            {activeVisible === "members" && <MembersSection />}
            {activeVisible === "workspace" && (
              <div className="space-y-10">
                <WorkspaceSection />
                <LanguageSection />
                <AppearanceSection />
                <DangerSection />
              </div>
            )}
            {/* Connect-phone section kept but intentionally not in the nav above:
                the entry point was removed (HOU-473) so it's unreachable today.
                Re-add the `phone` nav item to surface it again. */}
            {activeVisible === "phone" && <ConnectPhoneSection />}
            {activeVisible === "shortcuts" && <ShortcutsSection />}
            {activeVisible === "reportBug" && <ReportBugSection />}
          </div>
        )}
      </div>
    </div>
  );
}
