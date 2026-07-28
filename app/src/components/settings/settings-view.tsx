import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Spinner,
} from "@houston-ai/core";
import { ChevronLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  parseSettingsSection,
  type SettingsSectionId,
} from "../../lib/settings-sections";
import { workspaceGateState } from "../../lib/workspace-switch";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";
import { useAccountAvailable } from "./sections/account";
import { ApiKeysSection } from "./sections/api-keys";
import { MigrationSection, useMigrationAvailable } from "./sections/migration";
import { ProfileSection, useProfileAvailable } from "./sections/profile";
import { ReportBugSection } from "./sections/report-bug";
import { ShortcutsSection } from "./sections/shortcuts";
import {
  UserContextSection,
  WorkspaceContextSection,
} from "./sections/workspace-context";
import { SettingsIndex } from "./settings-index";

export function SettingsView() {
  const { t } = useTranslation(["settings", "common"]);
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const workspacesLoading = useWorkspaceStore((s) => s.loading);
  const workspaceLoadError = useWorkspaceStore((s) => s.loadError);
  const loadWorkspaces = useWorkspaceStore((s) => s.loadWorkspaces);
  const accountAvailable = useAccountAvailable();
  const profileAvailable = useProfileAvailable();
  const migrationAvailable = useMigrationAvailable();
  const setSettingsSection = useUIStore((s) => s.setSettingsSection);
  // Consume the one-shot deep-link the moment this view mounts: another surface
  // may have pinned a section (e.g. "apiKeys") right before switching to
  // Settings. Read it once for the initial screen...
  const [active, setActive] = useState<SettingsSectionId | null>(() =>
    parseSettingsSection(useUIStore.getState().settingsSection),
  );
  // ...then clear the pin. SettingsView mounts fresh per navigation, so leaving
  // it set would re-land a later plain Settings open on the same section.
  useEffect(() => {
    setSettingsSection(null);
  }, [setSettingsSection]);

  // Every section below reads the current workspace, so the view is gated on
  // it. "No workspace yet" hides three genuinely different situations, and
  // conflating them left a failed load spinning forever (HOU-818): still
  // loading is a spinner; a load that THREW blames the connection and offers a
  // retry; a load that succeeded with nothing is a dead end the user can also
  // only escape by retrying, but nothing is broken, so the copy must not
  // accuse their network.
  const gate = workspaceGateState({
    current: currentWorkspace,
    loading: workspacesLoading,
    loadError: workspaceLoadError,
  });
  if (gate === "loading") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner className="h-5 w-5" />
      </div>
    );
  }
  if (gate !== "ready") {
    const copy =
      gate === "failed"
        ? {
            title: t("settings:workspaceGate.failedTitle"),
            body: t("settings:workspaceGate.failedBody"),
          }
        : {
            title: t("settings:workspaceGate.emptyTitle"),
            body: t("settings:workspaceGate.emptyBody"),
          };
    return (
      <div className="flex-1 flex items-center justify-center">
        <Empty className="border-0">
          <EmptyHeader>
            <EmptyTitle>{copy.title}</EmptyTitle>
            <EmptyDescription>{copy.body}</EmptyDescription>
          </EmptyHeader>
          <Button
            className="mt-4 rounded-full"
            size="sm"
            variant="outline"
            onClick={() => void loadWorkspaces()}
          >
            {t("settings:workspaceGate.retry")}
          </Button>
        </Empty>
      </div>
    );
  }

  if (active === null) {
    return (
      <div className="flex-1 overflow-y-auto">
        <SettingsIndex
          accountAvailable={accountAvailable}
          migrationAvailable={migrationAvailable}
          profileAvailable={profileAvailable}
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
          className="inline-flex cursor-pointer items-center gap-1 text-sm text-ink-muted transition-colors hover:text-ink"
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
            {active === "profile" && <ProfileSection />}
            {/* The API-keys screen is HIDDEN from the index for now (HOU-806:
                the Agents API surface lives in the Routines tab) — its nav row
                is gone, so only a programmatic deep-link pin reaches it. The
                section and its plumbing stay intact for when it returns. */}
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
