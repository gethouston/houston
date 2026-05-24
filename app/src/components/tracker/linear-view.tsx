import { useTranslation } from "react-i18next";
import { Link2, Loader2, RefreshCw, ExternalLink } from "lucide-react";
import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@houston-ai/core";
import {
  useTrackerStatus,
  useTrackerIssues,
  useTrackerSyncNow,
} from "../../hooks/queries";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { osOpenUrl } from "../../lib/os-bridge";
import { LinearKanban } from "./linear-kanban";

/**
 * Top-level Linear board view — full kanban of mirrored issues for
 * the currently selected agent, grouped by Linear's typed workflow
 * states (To do / In progress / Done).
 *
 * Lifecycle states:
 * - No agent selected → prompt to pick one from the sidebar.
 * - Loading → spinner.
 * - Agent connected but zero issues → empty state with Sync-now.
 * - Agent not connected → CTA into Settings → Tracker.
 * - Connected with issues → header (org name, sync button) + kanban.
 *
 * Sidebar nav routes here via `viewMode === "linear"`. The Settings
 * view ([`TrackerSection`](../settings/sections/tracker.tsx))
 * still owns the OAuth lifecycle (connect / disconnect / error
 * cards) — keeping concerns split: this view shows the data, that
 * view manages the connection.
 */
export function LinearView() {
  const { t } = useTranslation(["tracker", "common"]);
  const currentAgent = useAgentStore((s) => s.current);
  const workspacePath = currentAgent?.folderPath;
  const addToast = useUIStore((s) => s.addToast);
  const setViewMode = useUIStore((s) => s.setViewMode);

  const status = useTrackerStatus("linear", workspacePath);
  const issues = useTrackerIssues("linear", workspacePath, false);
  const syncNow = useTrackerSyncNow("linear", workspacePath);

  // -- Lifecycle branch: no agent selected -----------------------
  if (!workspacePath) {
    return (
      <ViewShell title={t("linear.tab.title")}>
        <Empty>
          <EmptyHeader>
            <Link2 className="h-8 w-8 text-muted-foreground" />
            <EmptyTitle>{t("linear.tab.noAgentTitle")}</EmptyTitle>
            <EmptyDescription>{t("noAgent")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </ViewShell>
    );
  }

  // -- Lifecycle branch: status loading --------------------------
  if (status.isLoading) {
    return (
      <ViewShell title={t("linear.tab.title")}>
        <div className="flex items-center justify-center flex-1">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </ViewShell>
    );
  }

  const data = status.data;
  const connected = data?.state === "connected";

  // -- Lifecycle branch: not connected → push to Settings --------
  if (!connected) {
    return (
      <ViewShell title={t("linear.tab.title")}>
        <Empty>
          <EmptyHeader>
            <Link2 className="h-8 w-8 text-muted-foreground" />
            <EmptyTitle>{t("linear.tab.notConnectedTitle")}</EmptyTitle>
            <EmptyDescription>
              {t("linear.tab.notConnectedBody")}
            </EmptyDescription>
          </EmptyHeader>
          <Button onClick={() => setViewMode("settings")}>
            {t("linear.tab.openSettings")}
          </Button>
        </Empty>
      </ViewShell>
    );
  }

  // -- Lifecycle branch: connected -------------------------------
  async function handleSyncNow() {
    try {
      const summary = await syncNow.mutateAsync();
      if (summary.kind === "synced") {
        addToast({
          title: t("linear.syncedToast_other", {
            count: summary.issuesSeen,
            defaultValue: `Synced ${summary.issuesSeen} issues from Linear.`,
          }),
        });
      }
    } catch {
      // tauriTrackers.syncNow surfaces a toast via the standard
      // call() helper; nothing more to do here. The catch keeps
      // the promise chain from leaking an unhandled rejection.
    }
  }

  async function handleOpenIssue(issueUrl: string | null) {
    if (!issueUrl) return;
    try {
      await osOpenUrl(issueUrl);
    } catch {
      addToast({
        title: t("linear.issues.openFailed"),
        variant: "error",
      });
    }
  }

  return (
    <ViewShell
      title={t("linear.tab.title")}
      subtitle={data.orgName ?? undefined}
      headerActions={
        <Button
          variant="outline"
          size="sm"
          onClick={handleSyncNow}
          disabled={syncNow.isPending}
        >
          <RefreshCw
            className={`h-3.5 w-3.5 mr-1.5 ${
              syncNow.isPending ? "animate-spin" : ""
            }`}
          />
          {syncNow.isPending
            ? t("linear.connected.syncing")
            : t("linear.connected.syncNow")}
        </Button>
      }
    >
      <LinearKanban
        issues={issues.data ?? []}
        onSelect={(issue) => handleOpenIssue(issue.url ?? null)}
        emptyState={
          <Empty>
            <EmptyHeader>
              <ExternalLink className="h-8 w-8 text-muted-foreground" />
              <EmptyTitle>{t("linear.tab.zeroIssuesTitle")}</EmptyTitle>
              <EmptyDescription>
                {t("linear.tab.zeroIssuesBody")}
              </EmptyDescription>
            </EmptyHeader>
            <Button
              variant="outline"
              onClick={handleSyncNow}
              disabled={syncNow.isPending}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 mr-1.5 ${
                  syncNow.isPending ? "animate-spin" : ""
                }`}
              />
              {t("linear.connected.syncNow")}
            </Button>
          </Empty>
        }
      />
    </ViewShell>
  );
}

interface ViewShellProps {
  title: string;
  subtitle?: string;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}

function ViewShell({ title, subtitle, headerActions, children }: ViewShellProps) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link2 className="h-5 w-5 text-muted-foreground shrink-0" />
          <h1 className="text-lg font-semibold truncate">{title}</h1>
          {subtitle && (
            <span className="text-sm text-muted-foreground truncate">
              {subtitle}
            </span>
          )}
        </div>
        {headerActions}
      </header>
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
