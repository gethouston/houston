import { channelUnavailableReason } from "@houston/engine-adapter";
import {
  Bug,
  Building2,
  CircleUserRound,
  CloudUpload,
  CreditCard,
  Keyboard,
  MessagesSquare,
  UserRound,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useChannels } from "../../hooks/queries/use-channels";
import { useCapabilities } from "../../hooks/use-capabilities";
import { genericErrorDescription } from "../../lib/error-report";
import {
  type SettingsSectionId,
  settingsSectionAvailable,
} from "../../lib/settings-sections";
import { useUIStore } from "../../stores/ui";
import { PageContainer, PageHero } from "../shell/page-shell";
import { SettingsIdentityHeader } from "./identity-header";
import { AppearanceSection } from "./sections/appearance";
import { DangerSection } from "./sections/danger";
import { DeleteAccountSection } from "./sections/delete-account";
import { LanguageSection } from "./sections/language";
import { NotificationsSection } from "./sections/notifications";
import { SettingsCard, SettingsRow } from "./settings-row";

interface SettingsIndexProps {
  migrationAvailable: boolean;
  profileAvailable: boolean;
  onSelect: (id: SettingsSectionId) => void;
}

/**
 * The settings landing page: the standing setup a person adjusts, about their
 * own app and about the space they run.
 *
 * The page holds ONE general group (identity, About me, appearance, language,
 * notifications, then the standing setup of the space and the help-shaped
 * rows), plus Danger. One row administers the SPACE rather than the person:
 * Workspace management. The shared Skills library is a screen of its own, off
 * the rail's Skills row, so no row here leads to it.
 *
 * The page OPENS on the signed-in person: identity is the header, and
 * everything below it is a preference.
 *
 * Simple settings are resolved inline as control rows; the heavier ones
 * (shortcuts, bug report) are navigable rows that drill into their own screen.
 */
export function SettingsIndex({
  migrationAvailable,
  profileAvailable,
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
        <SettingsIdentityHeader />

        <SettingsCard title={t("settings:index.groups.general")}>
          {profileAvailable && (
            <SettingsRow
              icon={CircleUserRound}
              title={t("settings:nav.profile")}
              description={t("settings:index.rows.profile")}
              onClick={() => onSelect("profile")}
            />
          )}
          {/* What every agent reads about the person before it starts a turn:
              a standing preference they set once about themselves, so it sits
              with their name and their language rather than in the rail. */}
          <SettingsRow
            icon={UserRound}
            title={t("settings:nav.aboutMe")}
            description={t("settings:index.rows.aboutMe")}
            onClick={() => onSelect("aboutMe")}
          />
          {settingsSectionAvailable("plan", capabilities) && (
            <SettingsRow
              icon={CreditCard}
              title={t("plan:title")}
              description={t("plan:nav")}
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
          <SettingsRow
            icon={Building2}
            title={t("settings:nav.workspace")}
            description={t("settings:index.rows.workspace")}
            onClick={() => onSelect("workspace")}
          />
          {/* The API-keys row is HIDDEN for now (HOU-806): the Agents API
              surface lives in the Routines tab. The section, its strings, and
              all plumbing remain — restore by re-adding this row (and the
              apiKeysAvailable gate from apiKeysSupported) when it returns. */}
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
