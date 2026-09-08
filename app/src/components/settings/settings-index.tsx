import {
  Bug,
  CircleUserRound,
  CloudUpload,
  Keyboard,
  UserRound,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { genericErrorDescription } from "../../lib/error-report";
import type { SettingsSectionId } from "../../lib/settings-sections";
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
 * The settings landing page, and ONLY settings: the things every user adjusts
 * about their own app.
 *
 * Only preferences live here. The guided tour starts from the Agent Store, and
 * Time worked, Admin and Permissions are screens of their own in the rail's
 * "Workspace" band, because none of them is something a person adjusts about
 * their own app. What the page holds is ONE general group everybody sees
 * (identity, About me, appearance, language, notifications, account, then the
 * help-shaped rows), plus Danger. There is no role gate on this page.
 *
 * The page OPENS on the signed-in person: the rail's avatar menu was a second
 * door onto this page and is gone, so identity is a header here rather than a
 * row buried in the general group. Everything below it is a preference.
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
          {/* What every agent reads about the person before it starts a turn:
              a standing preference they set once about themselves, so it sits
              with their name and their language rather than in the rail. */}
          <SettingsRow
            icon={UserRound}
            title={t("settings:nav.aboutMe")}
            description={t("settings:index.rows.aboutMe")}
            onClick={() => onSelect("aboutMe")}
          />
          <AppearanceSection />
          <LanguageSection />
          <NotificationsSection />
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
