import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Spinner,
} from "@houston-ai/core";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { analytics } from "../../lib/analytics";
import { parseSettingsSection } from "../../lib/settings-sections";
import { workspaceGateState } from "../../lib/workspace-switch";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";
import { useMigrationAvailable } from "./sections/migration";
import { useProfileAvailable } from "./sections/profile";
import { SettingsIndex } from "./settings-index";
import { SettingsSectionBody } from "./settings-section-body";

/**
 * The centered frame every Settings loading state shares. Sized for both hosts
 * it renders in: `flex-1` when it IS the view (a flex column), `h-full` when it
 * fills a back bar's scroll region.
 */
function LoadingPane() {
  return (
    <div className="flex h-full flex-1 items-center justify-center">
      <Spinner className="h-5 w-5" />
    </div>
  );
}

export function SettingsView() {
  const { t } = useTranslation(["settings", "common"]);
  const currentWorkspace = useWorkspaceStore((s) => s.current);
  const workspacesLoading = useWorkspaceStore((s) => s.loading);
  const workspaceLoadError = useWorkspaceStore((s) => s.loadError);
  const loadWorkspaces = useWorkspaceStore((s) => s.loadWorkspaces);
  const profileAvailable = useProfileAvailable();
  const migrationAvailable = useMigrationAvailable();
  // The open section lives in the UI store, not in local state: every surface
  // that navigates here goes through `openSettings`, so a deep link lands even
  // when Settings is ALREADY open (a toast action fired from inside Settings
  // never remounts this view) and a plain "open Settings" always lands on the
  // index. `parseSettingsSection` guards the value on the way in.
  const setActive = useUIStore((s) => s.setSettingsSection);
  const active = parseSettingsSection(useUIStore((s) => s.settingsSection));

  // The index and EVERY section read the current workspace, so the whole screen
  // sits behind the workspace gate — no section opts out, because none of them
  // is a team surface any more. "No workspace yet" hides three genuinely
  // different situations, and conflating them left a failed load spinning
  // forever (HOU-818): still loading is a spinner; a load that THREW blames the
  // connection and offers a retry; a load that succeeded with nothing is a dead
  // end the user can also only escape by retrying, but nothing is broken, so
  // the copy must not accuse their network.
  const gate = workspaceGateState({
    current: currentWorkspace,
    loading: workspacesLoading,
    loadError: workspaceLoadError,
  });

  // One `tab_opened` per Settings surface actually reached, keyed like every
  // other view switch (`settings` for the index, `settings:profile` for a
  // section) so a single tab_name breakdown covers both depths. Settings owns
  // this event outright — the shell's generic viewMode effect skips `settings`,
  // so a deep link can no longer double-count — and a loading or error frame
  // emits nothing, because nobody opened it.
  const reached =
    gate !== "ready"
      ? null
      : active === null
        ? "settings"
        : `settings:${active}`;
  const lastReached = useRef<string | null>(null);
  useEffect(() => {
    if (reached === null || lastReached.current === reached) return;
    lastReached.current = reached;
    analytics.track("tab_opened", { tab_name: reached });
  }, [reached]);

  if (gate === "loading") return <LoadingPane />;
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
      <div className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <SettingsIndex
          migrationAvailable={migrationAvailable}
          profileAvailable={profileAvailable}
          onSelect={setActive}
        />
      </div>
    );
  }

  return (
    <SettingsSectionBody
      active={active}
      backLabel={t("settings:title")}
      onBack={() => setActive(null)}
    />
  );
}
