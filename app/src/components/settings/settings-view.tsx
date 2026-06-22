import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Spinner } from "@houston-ai/core";
import {
  User,
  Folder,
  Bot,
  Bug,
  FileText,
  Keyboard,
  UserCircle,
} from "lucide-react";
import { useWorkspaceStore } from "../../stores/workspaces";
import { useUIStore } from "../../stores/ui";
import {
  SidebarSectionNav,
  type SidebarSectionItem,
} from "../shared/sidebar-section-nav";

type SettingsSectionId =
  | "account"
  | "workspace"
  | "workspaceContext"
  | "userContext"
  | "provider"
  | "shortcuts"
  | "reportBug";
import { AccountSection, useAccountAvailable } from "./sections/account";
import { WorkspaceSection } from "./sections/workspace";
import {
  WorkspaceContextSection,
  UserContextSection,
} from "./sections/workspace-context";
import { ProviderSection } from "./sections/provider";
import { LanguageSection } from "./sections/language";
import { AppearanceSection } from "./sections/appearance";
import { DangerSection } from "./sections/danger";
import { ReportBugSection } from "./sections/report-bug";
import { ShortcutsSection } from "./sections/shortcuts";

export function SettingsView() {
  const { t } = useTranslation(["settings", "common"]);
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const accountAvailable = useAccountAvailable();
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
      { id: "provider", label: t("settings:nav.provider"), icon: Bot },
      { id: "shortcuts", label: t("settings:nav.shortcuts"), icon: Keyboard },
      { id: "reportBug", label: t("settings:nav.reportBug"), icon: Bug },
    );
    return list;
  }, [accountAvailable, t]);

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
            {activeVisible === "workspace" && (
              <div className="space-y-10">
                <WorkspaceSection />
                <LanguageSection />
                <AppearanceSection />
                <DangerSection />
              </div>
            )}
            {activeVisible === "provider" && <ProviderSection />}
            {activeVisible === "shortcuts" && <ShortcutsSection />}
            {activeVisible === "reportBug" && <ReportBugSection />}
          </div>
        )}
      </div>
    </div>
  );
}
