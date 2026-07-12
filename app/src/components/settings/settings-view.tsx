import { Spinner } from "@houston-ai/core";
import { ChevronLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../../hooks/use-capabilities";
import { apiKeysSupported } from "../../lib/api-keys-model";
import { canSeeMembers } from "../../lib/org-roles";
import {
  parseSettingsSection,
  type SettingsSectionId,
} from "../../lib/settings-sections";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";
import { useAccountAvailable } from "./sections/account";
import { ApiKeysSection } from "./sections/api-keys";
import { ConnectedAccountsSection } from "./sections/connected-accounts";
import { MembersSection } from "./sections/members";
import { MigrationSection, useMigrationAvailable } from "./sections/migration";
import { ReportBugSection } from "./sections/report-bug";
import { ShortcutsSection } from "./sections/shortcuts";
import {
  UserContextSection,
  WorkspaceContextSection,
} from "./sections/workspace-context";
import { SettingsIndex } from "./settings-index";

export function SettingsView() {
  const { t } = useTranslation(["settings", "common", "org"]);
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const accountAvailable = useAccountAvailable();
  const migrationAvailable = useMigrationAvailable();
  const { capabilities } = useCapabilities();
  const showMembers = canSeeMembers(capabilities);
  const apiKeysAvailable = apiKeysSupported(capabilities);
  const setSettingsSection = useUIStore((s) => s.setSettingsSection);
  // Consume the one-shot deep-link the moment this view mounts: another surface
  // may have pinned a section (e.g. "connectedAccounts") right before switching
  // to Settings. Read it once for the initial screen...
  const [active, setActive] = useState<SettingsSectionId | null>(() =>
    parseSettingsSection(useUIStore.getState().settingsSection),
  );
  // ...then clear the pin. SettingsView mounts fresh per navigation, so leaving
  // it set would re-land a later plain Settings open on the same section.
  useEffect(() => {
    setSettingsSection(null);
  }, [setSettingsSection]);

  if (!currentWorkspace) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner className="h-5 w-5" />
      </div>
    );
  }

  if (active === null) {
    return (
      <div className="flex-1 overflow-y-auto">
        <SettingsIndex
          accountAvailable={accountAvailable}
          showMembers={showMembers}
          apiKeysAvailable={apiKeysAvailable}
          migrationAvailable={migrationAvailable}
          onSelect={setActive}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex min-h-0 flex-col">
      <div className="shrink-0 px-8 pt-8 pb-2">
        <button
          type="button"
          onClick={() => setActive(null)}
          className="inline-flex cursor-pointer items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          {t("settings:title")}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {active === "workspaceContext" ? (
          <WorkspaceContextSection />
        ) : active === "userContext" ? (
          <UserContextSection />
        ) : (
          <div className="mx-auto max-w-xl px-8 pb-10">
            {active === "members" && <MembersSection />}
            {active === "connectedAccounts" && <ConnectedAccountsSection />}
            {active === "apiKeys" && <ApiKeysSection />}
            {active === "shortcuts" && <ShortcutsSection />}
            {active === "reportBug" && <ReportBugSection />}
            {active === "migration" && <MigrationSection />}
          </div>
        )}
      </div>
    </div>
  );
}
