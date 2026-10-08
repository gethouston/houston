import { channelUnavailableReason } from "@houston/engine-adapter";
import {
  Bug,
  CloudUpload,
  CreditCard,
  Keyboard,
  KeyRound,
  MessagesSquare,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useChannels } from "../../hooks/queries/use-channels";
import { useCapabilities } from "../../hooks/use-capabilities";
import { genericErrorDescription } from "../../lib/error-report";
import { canPurchaseInApp } from "../../lib/purchase-policy";
import {
  type SettingsSectionId,
  settingsSectionAvailable,
} from "../../lib/settings-sections";
import { useUIStore } from "../../stores/ui";
import { PageContainer, PageHero } from "../shell/page-shell";
import { AppearanceSection } from "./sections/appearance";
import { DangerSection } from "./sections/danger";
import { DeleteAccountSection } from "./sections/delete-account";
import { LanguageSection } from "./sections/language";
import { NotificationsSection } from "./sections/notifications";
import { SettingsCard, SettingsRow } from "./settings-row";

interface SettingsIndexProps {
  migrationAvailable: boolean;
  onSelect: (id: SettingsSectionId) => void;
}

/**
 * The settings landing page: the standing setup a person adjusts, about their
 * own app and preferences.
 *
 * The page holds ONE general group (plan, channels, appearance, language,
 * notifications, and the API-key, shortcut, bug-report and migration rows), plus
 * Danger. Admin is its own screen; an AI Employee's Skills live in that
 * employee's settings. The person themselves (who is signed in, Sign out,
 * their Profile and About me) is the account menu's, not a row here.
 *
 * Simple settings are resolved inline as control rows; the heavier ones
 * (shortcuts, bug report) are navigable rows that drill into their own screen.
 */
export function SettingsIndex({
  migrationAvailable,
  onSelect,
}: SettingsIndexProps) {
  const { t } = useTranslation("settings");
  const channels = useChannels();
  const { capabilities } = useCapabilities();
  const channelsAvailable =
    !!channels.data ||
    channelUnavailableReason(channels.error) === "not-configured";
  const addToast = useUIStore((s) => s.addToast);

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
      <PageHero
        title={t("settings:title")}
        subtitle={t("settings:index.subtitle")}
        className="mb-8 px-1"
      />

      <div className="space-y-8">
        <SettingsCard title={t("settings:index.groups.general")}>
          {settingsSectionAvailable("plan", capabilities) && (
            <SettingsRow
              icon={CreditCard}
              title={t("plan:title")}
              description={
                canPurchaseInApp() ? t("plan:nav") : t("plan:native.nav")
              }
              onClick={() => onSelect("plan")}
            />
          )}
          {channelsAvailable && (
            <SettingsRow
              icon={MessagesSquare}
              title={t("settings:channels.title")}
              description={t("settings:channels.navDescription")}
              onClick={() => onSelect("channels")}
            />
          )}
          <AppearanceSection />
          <LanguageSection />
          <NotificationsSection />
          {settingsSectionAvailable("apiKeys", capabilities) && (
            <SettingsRow
              icon={KeyRound}
              title={t("settings:nav.apiKeys")}
              badge={t("settings:advancedBadge")}
              description={t("settings:index.rows.apiKeys")}
              onClick={() => onSelect("apiKeys")}
            />
          )}
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
          <DeleteAccountSection />
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
