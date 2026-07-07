import { Bug, FileText, Keyboard, User, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useOrg } from "../../hooks/queries";
import { useWorkspaceContext } from "../../hooks/queries/use-workspace-context";
import { genericErrorDescription } from "../../lib/error-toast";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { AccountSection } from "./sections/account";
import { AppearanceSection } from "./sections/appearance";
import { DangerSection } from "./sections/danger";
import { LanguageSection } from "./sections/language";
import { SettingsCard, SettingsRow } from "./settings-row";

/** A settings section that opens on its own screen (a back bar returns here). */
export type SettingsSectionId =
  | "members"
  | "workspaceContext"
  | "userContext"
  | "shortcuts"
  | "reportBug";

interface SettingsIndexProps {
  accountAvailable: boolean;
  showMembers: boolean;
  onSelect: (id: SettingsSectionId) => void;
}

/**
 * The settings landing page. Simple settings (appearance, language, account,
 * delete) are resolved inline as control rows; the heavier
 * ones (context editors, members, shortcuts, bug report) are navigable rows that
 * drill into their own screen. Account and members appear only when applicable.
 */
export function SettingsIndex({
  accountAvailable,
  showMembers,
  onSelect,
}: SettingsIndexProps) {
  const { t } = useTranslation(["settings", "org"]);
  const agentPath = useAgentStore((s) => s.current?.folderPath);
  const org = useOrg(showMembers);
  const { data: context } = useWorkspaceContext(agentPath);
  const addToast = useUIStore((s) => s.addToast);

  const memberCount = org.data?.members?.length ?? 0;
  const contextValue = (slot: "workspace" | "user") =>
    context?.[slot]?.trim() ? t("settings:index.values.set") : undefined;

  async function handleVersionClick() {
    try {
      await navigator.clipboard.writeText(__APP_VERSION__);
      addToast({ title: t("settings:toasts.versionCopied") });
    } catch (err) {
      addToast({
        title: t("settings:toasts.versionCopyFailed"),
        description: genericErrorDescription("copy_version", err),
        variant: "error",
      });
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-8 py-10">
      <header className="mb-8 px-1">
        <h1 className="text-[28px] font-normal text-foreground">
          {t("settings:title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("settings:index.subtitle")}
        </p>
      </header>

      <div className="space-y-8">
        <SettingsCard>
          {/* WorkspaceSection (rename) is deliberately not rendered: the
              workspace name is fixed for now (HOU-704). */}
          <AppearanceSection />
          <LanguageSection />
          {accountAvailable && <AccountSection />}
          {showMembers && (
            <SettingsRow
              icon={Users}
              title={t("org:members.navLabel")}
              description={t("settings:index.rows.members")}
              value={t("settings:index.values.membersCount", {
                count: memberCount,
              })}
              onClick={() => onSelect("members")}
            />
          )}
        </SettingsCard>

        <SettingsCard title={t("settings:index.groups.context")}>
          <SettingsRow
            icon={FileText}
            title={t("settings:nav.workspaceContext")}
            description={t("settings:index.rows.workspaceContext")}
            value={contextValue("workspace")}
            onClick={() => onSelect("workspaceContext")}
          />
          <SettingsRow
            icon={User}
            title={t("settings:nav.userContext")}
            description={t("settings:index.rows.userContext")}
            value={contextValue("user")}
            onClick={() => onSelect("userContext")}
          />
        </SettingsCard>

        <SettingsCard title={t("settings:index.groups.support")}>
          <SettingsRow
            icon={Keyboard}
            title={t("settings:nav.shortcuts")}
            description={t("settings:index.rows.shortcuts")}
            onClick={() => onSelect("shortcuts")}
          />
          <SettingsRow
            icon={Bug}
            title={t("settings:nav.reportBug")}
            description={t("settings:index.rows.reportBug")}
            onClick={() => onSelect("reportBug")}
          />
        </SettingsCard>

        <SettingsCard>
          <DangerSection />
        </SettingsCard>
      </div>

      <footer className="mt-10 px-1">
        <button
          type="button"
          onClick={() => void handleVersionClick()}
          className="cursor-pointer text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {t("settings:version", { version: __APP_VERSION__ })}
        </button>
      </footer>
    </div>
  );
}
