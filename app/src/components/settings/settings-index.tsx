import {
  Bug,
  Building2,
  CircleUserRound,
  CloudUpload,
  FileText,
  Gauge,
  Keyboard,
  ShieldCheck,
  User,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useWorkspaceContext } from "../../hooks/queries/use-workspace-context";
import { genericErrorDescription } from "../../lib/error-report";
import type { SettingsSectionId } from "../../lib/settings-sections";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { PageContainer, PageHeader } from "../shell/page-shell";
import { AccountSection } from "./sections/account";
import { AppearanceSection } from "./sections/appearance";
import { DangerSection } from "./sections/danger";
import { LanguageSection } from "./sections/language";
import { NotificationsSection } from "./sections/notifications";
import { SettingsCard, SettingsRow } from "./settings-row";

interface SettingsIndexProps {
  accountAvailable: boolean;
  migrationAvailable: boolean;
  profileAvailable: boolean;
  /** Teams gate for the Usage row (shares the AI Models hub gate). */
  showAiModels: boolean;
  /** Teams gate for the Admin + Permissions rows. */
  showOrganization: boolean;
  onSelect: (id: SettingsSectionId) => void;
}

/**
 * The settings landing page. Simple settings (appearance, language, account,
 * delete) are resolved inline as control rows; the heavier
 * ones (context editors, shortcuts, bug report, and since HOU-788 Usage,
 * Permissions and Admin) are navigable rows that drill into their own screen.
 * Account appears only when applicable; the Workspace and Team groups only when
 * their Teams gate passes.
 */
export function SettingsIndex({
  accountAvailable,
  migrationAvailable,
  profileAvailable,
  showAiModels,
  showOrganization,
  onSelect,
}: SettingsIndexProps) {
  const { t } = useTranslation("settings");
  const agentPath = useAgentStore((s) => s.current?.folderPath);
  const { data: context } = useWorkspaceContext(agentPath);
  const addToast = useUIStore((s) => s.addToast);

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
    <PageContainer className="py-10">
      <PageHeader
        title={t("settings:title")}
        subtitle={t("settings:index.subtitle")}
        className="mb-8 px-1"
      />

      <div className="space-y-8">
        <SettingsCard>
          {/* WorkspaceSection (rename) is deliberately not rendered: the
              workspace name is fixed for now (HOU-704). */}
          {profileAvailable && (
            <SettingsRow
              icon={CircleUserRound}
              title={t("settings:nav.profile")}
              description={t("settings:index.rows.profile")}
              onClick={() => onSelect("profile")}
            />
          )}
          <AppearanceSection />
          <LanguageSection />
          <NotificationsSection />
          {accountAvailable && <AccountSection />}
          {/* The API-keys row is HIDDEN for now (HOU-806): the Agents API
              surface lives in the Routines tab. The section, its strings, and
              all plumbing remain — restore by re-adding this row (and the
              apiKeysAvailable gate from apiKeysSupported) when it returns. */}
        </SettingsCard>

        {showAiModels && (
          <SettingsCard title={t("settings:index.groups.workspace")}>
            <SettingsRow
              icon={Gauge}
              title={t("settings:nav.usage")}
              description={t("settings:index.rows.usage")}
              testId="settings-row-usage"
              onClick={() => onSelect("usage")}
            />
          </SettingsCard>
        )}

        {showOrganization && (
          <SettingsCard title={t("settings:index.groups.team")}>
            <SettingsRow
              icon={Building2}
              title={t("settings:nav.organization")}
              description={t("settings:index.rows.organization")}
              testId="settings-row-organization"
              onClick={() => onSelect("organization")}
            />
            <SettingsRow
              icon={ShieldCheck}
              title={t("settings:nav.permissions")}
              description={t("settings:index.rows.permissions")}
              testId="settings-row-permissions"
              onClick={() => onSelect("permissions")}
            />
          </SettingsCard>
        )}

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
          {migrationAvailable && (
            <SettingsRow
              icon={CloudUpload}
              title={t("settings:migration.title")}
              description={t("settings:index.rows.migration")}
              onClick={() => onSelect("migration")}
            />
          )}
        </SettingsCard>

        <SettingsCard>
          <DangerSection />
        </SettingsCard>
      </div>

      <footer className="mt-10 px-1">
        <button
          type="button"
          onClick={() => void handleVersionClick()}
          className="cursor-pointer text-xs text-ink-muted transition-colors hover:text-ink"
        >
          {t("settings:version", { version: __APP_VERSION__ })}
        </button>
      </footer>
    </PageContainer>
  );
}
