import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link2, Loader2, RefreshCw, ExternalLink } from "lucide-react";
import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  cn,
} from "@houston-ai/core";
import {
  useTrackerStatus,
  useTrackerIssues,
  useTrackerSyncNow,
  useTrackerConnectionList,
} from "../../hooks/queries";
import { LinearConnectionsPanel } from "./linear-connections-panel";
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
  // Workspace-many list (PR B): surfaces the multi-connection
  // panel below the kanban when 2+ Linear connections are registered
  // to the workspace. PR D wires the kanban itself to the selected
  // connection via the picker below.
  const connectionList = useTrackerConnectionList("linear", workspacePath);

  // PR D — connection picker. Defaults to undefined (legacy per-agent
  // read) when 0/1 connection exists; when 2+, defaults to the first
  // org and lets the user switch. Auto-falls-back if the currently-
  // selected org is removed (via Disconnect on the panel).
  const connections = connectionList.data?.connections ?? [];
  const [selectedOrgId, setSelectedOrgId] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (connections.length <= 1) {
      // Single (or zero) connection — read via the legacy per-agent
      // path so today's mirror data keeps rendering until PR E.
      setSelectedOrgId(undefined);
      return;
    }
    // Multiple connections — make sure selected is still valid;
    // default to the first when not.
    const ids = new Set(connections.map((c) => c.orgId));
    if (!selectedOrgId || !ids.has(selectedOrgId)) {
      setSelectedOrgId(connections[0]?.orgId);
    }
  }, [connections, selectedOrgId]);

  const issues = useTrackerIssues("linear", workspacePath, false, selectedOrgId);
  const syncNow = useTrackerSyncNow("linear", workspacePath, selectedOrgId);

  const selectedConnection = useMemo(
    () => connections.find((c) => c.orgId === selectedOrgId),
    [connections, selectedOrgId],
  );

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

  // Header subtitle: prefer the picked org's name when present;
  // otherwise the single-connection org name from status.
  const headerSubtitle = selectedConnection?.orgName ?? data.orgName ?? undefined;

  return (
    <ViewShell
      title={t("linear.tab.title")}
      subtitle={headerSubtitle}
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
      {connections.length > 1 && (
        <div className="flex items-center gap-2 px-6 py-3 border-b border-border shrink-0 overflow-x-auto">
          <span className="text-xs text-muted-foreground shrink-0">
            {t("linear.picker.label")}
          </span>
          <div className="flex items-center gap-1.5">
            {connections.map((c) => (
              <button
                key={c.orgId}
                onClick={() => setSelectedOrgId(c.orgId)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-xs font-medium transition-colors duration-150 whitespace-nowrap",
                  c.orgId === selectedOrgId
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-secondary",
                )}
              >
                {c.orgName}
              </button>
            ))}
          </div>
        </div>
      )}
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
      <div className="px-6 pb-4">
        <LinearConnectionsPanel
          provider="linear"
          workspacePath={workspacePath}
          data={connectionList.data}
          isLoading={connectionList.isLoading}
        />
      </div>
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
