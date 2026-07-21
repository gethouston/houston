"use client";

import {
  type CreatorReport,
  type ReportStatus,
  StoreApiError,
} from "@houston/agentstore-client";
import { Alert, AlertDescription, Button, Spinner } from "@houston-ai/core";
import * as React from "react";
import {
  actOnCreatorReport,
  listCreatorReports,
} from "@/lib/store-admin-client";

const FILTERS: { value: ReportStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed" },
];

type Load =
  | { status: "loading" }
  | { status: "forbidden" }
  | { status: "error"; message: string }
  | { status: "ready"; items: CreatorReport[] };

function classify(err: unknown): Load {
  if (err instanceof StoreApiError && err.status === 404) {
    return { status: "forbidden" };
  }
  return {
    status: "error",
    message: err instanceof Error ? err.message : "Could not load reports.",
  };
}

/** The creator abuse-report feed: filter by status, resolve or dismiss inline. */
export function CreatorReportsTab({
  getToken,
}: {
  getToken: () => Promise<string | null>;
}) {
  const [filter, setFilter] = React.useState<ReportStatus>("open");
  const [load, setLoad] = React.useState<Load>({ status: "loading" });
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [rowError, setRowError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setLoad({ status: "loading" });
    try {
      const token = await getToken();
      if (!token) throw new Error("Sign in again.");
      setLoad({
        status: "ready",
        items: await listCreatorReports(token, filter),
      });
    } catch (err) {
      setLoad(classify(err));
    }
  }, [getToken, filter]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  async function decide(id: string, action: "resolve" | "dismiss") {
    setBusyId(id);
    setRowError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Sign in again.");
      await actOnCreatorReport(token, id, action);
      setLoad((prev) =>
        prev.status === "ready"
          ? { status: "ready", items: prev.items.filter((i) => i.id !== id) }
          : prev,
      );
    } catch (err) {
      setRowError(
        err instanceof Error ? err.message : "Could not update that report.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            size="sm"
            variant={filter === f.value ? "default" : "outline"}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {rowError && (
        <Alert variant="destructive">
          <AlertDescription>{rowError}</AlertDescription>
        </Alert>
      )}

      {load.status === "loading" && (
        <div className="flex items-center gap-3 py-8 text-muted-foreground">
          <Spinner /> Loading reports…
        </div>
      )}
      {load.status === "forbidden" && (
        <p className="py-8 text-sm text-muted-foreground">
          Your account does not have moderation access.
        </p>
      )}
      {load.status === "error" && (
        <Alert variant="destructive">
          <AlertDescription>{load.message}</AlertDescription>
        </Alert>
      )}
      {load.status === "ready" && load.items.length === 0 && (
        <p className="py-8 text-sm text-muted-foreground">
          No {filter} reports.
        </p>
      )}

      {load.status === "ready" &&
        load.items.map((report) => (
          <article
            key={report.id}
            className="flex flex-col gap-3 rounded-xl border bg-card p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground">
                  {report.reason}
                </span>
                <span className="text-sm font-medium text-foreground">
                  {report.handle
                    ? `@${report.handle}`
                    : `user ${report.profileUserId}`}
                </span>
              </div>
              <time className="text-xs text-muted-foreground">
                {new Date(report.createdAt).toLocaleDateString()}
              </time>
            </div>
            {report.details && (
              <p className="text-sm text-foreground/90 text-pretty">
                {report.details}
              </p>
            )}
            {report.contact && (
              <p className="text-xs text-muted-foreground">
                Contact: {report.contact}
              </p>
            )}
            {filter === "open" && (
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === report.id}
                  onClick={() => decide(report.id, "dismiss")}
                >
                  Dismiss
                </Button>
                <Button
                  size="sm"
                  disabled={busyId === report.id}
                  onClick={() => decide(report.id, "resolve")}
                >
                  {busyId === report.id && <Spinner className="size-4" />}
                  Resolve
                </Button>
              </div>
            )}
          </article>
        ))}
    </div>
  );
}
