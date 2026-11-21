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
import { SettingsIndex } from "./settings-index";
import { SettingsSectionBody } from "./settings-section-body";

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
  const migrationAvailable = useMigrationAvailable();
  const setActive = useUIStore((s) => s.setSettingsSection);
  const active = parseSettingsSection(useUIStore((s) => s.settingsSection));

  const gate = workspaceGateState({
    current: currentWorkspace,
    loading: workspacesLoading,
    loadError: workspaceLoadError,
  });

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
