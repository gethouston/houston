import {
  Bug,
  CloudUpload,
  FileText,
  Keyboard,
  KeyRound,
  User,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useWorkspaceContext } from "../../hooks/queries/use-workspace-context";
import { isHostedGatewayEngine } from "../../lib/engine";
import { genericErrorDescription } from "../../lib/error-toast";
import { osIsTauri } from "../../lib/os-bridge";
import type { SettingsSectionId } from "../../lib/settings-sections";
import { useAgentStore } from "../../stores/agents";
import { useMigrateToCloudStore } from "../../stores/migrate-to-cloud";
import { useUIStore } from "../../stores/ui";
import { PageContainer, PageHeader } from "../shell/page-shell";
import { AccountSection } from "./sections/account";
import { AppearanceSection } from "./sections/appearance";
import { DangerSection } from "./sections/danger";
import { LanguageSection } from "./sections/language";
import { SettingsCard, SettingsRow } from "./settings-row";

interface SettingsIndexProps {
  accountAvailable: boolean;
  apiKeysAvailable: boolean;
  migrationAvailable: boolean;
  onSelect: (id: SettingsSectionId) => void;
}

/**
 * The settings landing page. Simple settings (appearance, language, account,
 * delete) are resolved inline as control rows; the heavier
 * ones (context editors, shortcuts, bug report) are navigable rows that
 * drill into their own screen. Account appears only when applicable.
 */
export function SettingsIndex({
  accountAvailable,
  apiKeysAvailable,
  migrationAvailable,
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
          <AppearanceSection />
          <LanguageSection />
          {accountAvailable && <AccountSection />}
          {apiKeysAvailable && (
            <SettingsRow
              icon={KeyRound}
              title={t("settings:nav.apiKeys")}
              description={t("settings:index.rows.apiKeys")}
              onClick={() => onSelect("apiKeys")}
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
          {/* Local (sidecar) builds: reopen the legacy→cloud upgrade offer.
              The cloud-build counterpart above re-runs the DATA import; this
              one installs the cloud APP — mutually exclusive gates. */}
          {!isHostedGatewayEngine() && osIsTauri() && (
            <SettingsRow
              icon={CloudUpload}
              title={t("settings:migrateToCloud.title")}
              description={t("settings:index.rows.migrateToCloud")}
              onClick={() => useMigrateToCloudStore.getState().open("settings")}
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
