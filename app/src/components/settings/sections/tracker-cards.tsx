import { useTranslation } from "react-i18next";
import { Loader2, AlertTriangle, Check, RefreshCw } from "lucide-react";
import type { TrackerIssue } from "@houston-ai/engine-client";
import { LinearIssuesList } from "../../tracker/linear-issues-list";

/**
 * State-card variants for {@link TrackerSection}. Split out to stay
 * under the 200-line file limit and to keep the main section focused
 * on lifecycle wiring rather than visual states.
 *
 * All four cards are render-only — they take props and emit clicks;
 * `tracker.tsx` owns the mutations and TanStack Query.
 */

interface NotConnectedCardProps {
  onConnect: () => void;
  pending: boolean;
}

export function NotConnectedCard({ onConnect, pending }: NotConnectedCardProps) {
  const { t } = useTranslation("tracker");
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-base font-medium mb-1.5">
        {t("linear.notConnected.title")}
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        {t("linear.notConnected.body")}
      </p>
      <button
        type="button"
        onClick={onConnect}
        disabled={pending}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        {pending
          ? t("linear.notConnected.connecting")
          : t("linear.notConnected.connect")}
      </button>
    </div>
  );
}

export function ConnectingCard() {
  const { t } = useTranslation("tracker");
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-3 mb-2">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <h3 className="text-base font-medium">{t("linear.connecting.title")}</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        {t("linear.connecting.body")}
      </p>
    </div>
  );
}

interface ConnectedCardProps {
  orgName: string;
  capabilities: string[];
  connectedAt: string | undefined;
  issuesCount: number | undefined;
  issues: TrackerIssue[];
  onDisconnect: () => void;
  disconnectPending: boolean;
  onSyncNow: () => void;
  syncPending: boolean;
}

const ISSUE_PREVIEW_LIMIT = 5;

export function ConnectedCard({
  orgName,
  capabilities,
  connectedAt,
  issuesCount,
  issues,
  onDisconnect,
  disconnectPending,
  onSyncNow,
  syncPending,
}: ConnectedCardProps) {
  const { t } = useTranslation(["tracker", "common"]);
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-start gap-3">
          <Check className="h-4 w-4 text-green-600 mt-0.5" />
          <div>
            <h3 className="text-base font-medium">{orgName}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("tracker:linear.connected.subtitle", {
                date: connectedAt
                  ? new Date(connectedAt).toLocaleDateString()
                  : t("common:unknown"),
              })}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDisconnect}
          disabled={disconnectPending}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          {disconnectPending
            ? t("tracker:linear.connected.disconnecting")
            : t("tracker:linear.connected.disconnect")}
        </button>
      </div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-sm text-muted-foreground">
          {issuesCount === undefined
            ? t("tracker:linear.connected.issuesLoading")
            : t("tracker:linear.connected.issuesCount", { count: issuesCount })}
        </p>
        <button
          type="button"
          onClick={onSyncNow}
          disabled={syncPending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${syncPending ? "animate-spin" : ""}`}
          />
          {syncPending
            ? t("tracker:linear.connected.syncing")
            : t("tracker:linear.connected.syncNow")}
        </button>
      </div>
      {capabilities.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {capabilities.map((cap) => (
            <span
              key={cap}
              className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
            >
              {cap}
            </span>
          ))}
        </div>
      )}
      {issues.length > 0 && (
        <div className="border-t border-border pt-3">
          <LinearIssuesList issues={issues} limit={ISSUE_PREVIEW_LIMIT} />
        </div>
      )}
    </div>
  );
}

interface ErrorCardProps {
  message: string | null;
  onRetry: () => void;
  pending: boolean;
}

export function ErrorCard({ message, onRetry, pending }: ErrorCardProps) {
  const { t } = useTranslation("tracker");
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
      <div className="flex items-center gap-3 mb-2">
        <AlertTriangle className="h-4 w-4 text-destructive" />
        <h3 className="text-base font-medium">{t("linear.error.title")}</h3>
      </div>
      {message && (
        <p className="text-sm text-muted-foreground mb-4 font-mono break-words">
          {message}
        </p>
      )}
      <button
        type="button"
        onClick={onRetry}
        disabled={pending}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        {pending ? t("linear.error.retrying") : t("linear.error.retry")}
      </button>
    </div>
  );
}
