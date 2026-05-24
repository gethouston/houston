import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link2, RefreshCw } from "lucide-react";
import { Button, ConfirmDialog } from "@houston-ai/core";
import type {
  TrackerConnectionList,
  TrackerConnectionListItem,
  TrackerProvider,
} from "@houston-ai/engine-client";
import {
  useTrackerDisconnect,
  useTrackerSyncNow,
} from "../../hooks/queries";
import { useUIStore } from "../../stores/ui";

/**
 * Workspace-many list surface (PR B + PR C).
 *
 * PR B shipped this as informational read-only. PR C adds per-row
 * Disconnect buttons backed by the new per-org engine route
 * (`DELETE /v1/trackers/linear/connect?workspacePath=...&orgId=...`).
 *
 * Today's Settings + LinearView still drive their primary
 * connection through the legacy per-agent path; this panel is the
 * canonical per-org control surface. PR D adds per-row Sync and
 * retires the legacy path entirely.
 */
export interface LinearConnectionsPanelProps {
  provider: TrackerProvider;
  workspacePath: string | undefined;
  data: TrackerConnectionList | undefined;
  isLoading: boolean;
  /** Hide entirely when only zero or one connection is present —
   *  the existing single-card view above already covers that
   *  shape, and a list of one is more noise than signal. */
  hideWhenLeOne?: boolean;
}

export function LinearConnectionsPanel({
  provider,
  workspacePath,
  data,
  isLoading,
  hideWhenLeOne = true,
}: LinearConnectionsPanelProps) {
  const { t } = useTranslation(["tracker", "common"]);

  if (isLoading) return null;
  const connections = data?.connections ?? [];
  if (hideWhenLeOne && connections.length <= 1) return null;

  return (
    <section className="mt-6 border border-border rounded-lg p-4">
      <header className="flex items-center gap-2 mb-3">
        <Link2 className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">
          {t("linear.connections.heading", { count: connections.length })}
        </h3>
      </header>
      <p className="text-xs text-muted-foreground mb-3">
        {t("linear.connections.intro")}
      </p>
      <ul className="space-y-2">
        {connections.map((c) => (
          <LinearConnectionRow
            key={c.orgId}
            provider={provider}
            workspacePath={workspacePath}
            connection={c}
          />
        ))}
      </ul>
    </section>
  );
}

interface LinearConnectionRowProps {
  provider: TrackerProvider;
  workspacePath: string | undefined;
  connection: TrackerConnectionListItem;
}

function LinearConnectionRow({
  provider,
  workspacePath,
  connection,
}: LinearConnectionRowProps) {
  const { t } = useTranslation(["tracker", "common"]);
  const addToast = useUIStore((s) => s.addToast);
  const disconnect = useTrackerDisconnect(
    provider,
    workspacePath,
    connection.orgId,
  );
  const syncNow = useTrackerSyncNow(provider, workspacePath, connection.orgId);
  const [showConfirm, setShowConfirm] = useState(false);

  async function handleConfirm() {
    try {
      await disconnect.mutateAsync();
      addToast({
        title: t("linear.connections.disconnectedToast", {
          orgName: connection.orgName,
        }),
      });
    } catch {
      // call() helper already surfaced a toast on failure; nothing
      // more to do here. The catch keeps the promise chain from
      // leaking an unhandled rejection.
    } finally {
      setShowConfirm(false);
    }
  }

  async function handleSync() {
    try {
      const summary = await syncNow.mutateAsync();
      if (summary.kind === "synced") {
        addToast({
          title: t("linear.connections.syncedToast", {
            orgName: connection.orgName,
            count: summary.issuesSeen,
          }),
        });
      }
    } catch {
      // call() helper already surfaced a toast on failure.
    }
  }

  return (
    <>
      <li className="flex items-center justify-between rounded-md bg-secondary/30 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{connection.orgName}</p>
          <p className="text-xs text-muted-foreground font-mono truncate">
            {connection.orgId}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          {connection.capabilities.length > 0 && (
            <div className="hidden sm:flex items-center gap-1">
              {connection.capabilities.slice(0, 3).map((cap) => (
                <span
                  key={cap}
                  className="inline-flex h-[18px] items-center rounded-full bg-background px-2 text-[10px] font-medium text-muted-foreground border border-border"
                >
                  {cap}
                </span>
              ))}
              {connection.capabilities.length > 3 && (
                <span className="text-[10px] text-muted-foreground">
                  {t("linear.connections.moreCaps", {
                    count: connection.capabilities.length - 3,
                  })}
                </span>
              )}
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSync}
            disabled={syncNow.isPending || !workspacePath}
            title={t("linear.connected.syncNow")}
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
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowConfirm(true)}
            disabled={disconnect.isPending || !workspacePath}
          >
            {disconnect.isPending
              ? t("linear.connected.disconnecting")
              : t("linear.connected.disconnect")}
          </Button>
        </div>
      </li>
      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title={t("linear.connections.disconnectConfirmTitle", {
          orgName: connection.orgName,
        })}
        description={t("linear.connections.disconnectConfirmBody")}
        onConfirm={handleConfirm}
      />
    </>
  );
}
