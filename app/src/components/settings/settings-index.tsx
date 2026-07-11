import {
  Blocks,
  Bug,
  CloudUpload,
  FileText,
  Keyboard,
  User,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useIntegrationConnections, useOrg } from "../../hooks/queries";
import { useWorkspaceContext } from "../../hooks/queries/use-workspace-context";
import { useCapabilities } from "../../hooks/use-capabilities";
import { genericErrorDescription } from "../../lib/error-toast";
import type { SettingsSectionId } from "../../lib/settings-sections";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import {
  INTEGRATION_PROVIDER,
  integrationsSupported,
} from "../integrations/model";
import { PageContainer, PageHeader } from "../shell/page-shell";
import { AccountSection } from "./sections/account";
import { AppearanceSection } from "./sections/appearance";
import { DangerSection } from "./sections/danger";
import { LanguageSection } from "./sections/language";
import { SettingsCard, SettingsRow } from "./settings-row";

interface SettingsIndexProps {
  accountAvailable: boolean;
  showMembers: boolean;
  migrationAvailable: boolean;
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
  migrationAvailable,
  onSelect,
}: SettingsIndexProps) {
  const { t } = useTranslation(["settings", "org"]);
  const agentPath = useAgentStore((s) => s.current?.folderPath);
  const org = useOrg(showMembers);
  const { data: context } = useWorkspaceContext(agentPath);
  const addToast = useUIStore((s) => s.addToast);
  const { capabilities } = useCapabilities();
  const integrationsAvailable = integrationsSupported(capabilities);
  const connections = useIntegrationConnections(
    INTEGRATION_PROVIDER,
    integrationsAvailable,
  );
  // Only the active connections count as "connected apps"; a pending/errored
  // OAuth is still recovering. Undefined while the query loads so the row shows
  // no value rather than a premature "0 apps".
  const appCount = connections.data?.filter(
    (c) => c.status === "active",
  ).length;

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
          <AppearanceSection />
          <LanguageSection />
          {accountAvailable && <AccountSection />}
          {integrationsAvailable && (
            <SettingsRow
              icon={Blocks}
              title={t("settings:nav.connectedAccounts")}
              description={t("settings:index.rows.connectedAccounts")}
              value={
                appCount === undefined
                  ? undefined
                  : t("settings:index.values.appsCount", { count: appCount })
              }
              onClick={() => onSelect("connectedAccounts")}
            />
          )}
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
          className="cursor-pointer text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {t("settings:version", { version: __APP_VERSION__ })}
        </button>
      </footer>
    </PageContainer>
  );
}
