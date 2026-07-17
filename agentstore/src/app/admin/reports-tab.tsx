"use client";

import {
  type AdminReport,
  type ReportStatus,
  StoreApiError,
} from "@houston/agentstore-client";
import { Alert, AlertDescription, Button, Spinner } from "@houston-ai/core";
import * as React from "react";
import { actOnReport, listAdminReports } from "@/lib/store-admin-client";
import { type AgentGroup, ReportGroupCard } from "./report-group-card";

const FILTERS: { value: ReportStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed" },
];

type Load =
  | { status: "loading" }
  | { status: "forbidden" }
  | { status: "error"; message: string }
  | { status: "ready"; items: AdminReport[] };

/** Bucket a flat report list by agent, preserving server order within each group. */
export function groupByAgent(items: AdminReport[]): AgentGroup[] {
  const groups = new Map<string, AgentGroup>();
  for (const item of items) {
    const group = groups.get(item.agentId);
    if (group) group.reports.push(item);
    else
      groups.set(item.agentId, {
        agentId: item.agentId,
        agentSlug: item.agentSlug,
        reports: [item],
      });
  }
  return [...groups.values()];
}

function classify(err: unknown): Load {
  if (err instanceof StoreApiError && err.status === 404) {
    return { status: "forbidden" };
  }
  return {
    status: "error",
    message: err instanceof Error ? err.message : "Could not load reports.",
  };
}

/** The reports feed: filter by status, grouped by agent, resolve/dismiss inline. */
export function ReportsTab({
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
        items: await listAdminReports(token, filter),
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
      await actOnReport(token, id, action);
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
        groupByAgent(load.items).map((group) => (
          <ReportGroupCard
            key={group.agentId}
            group={group}
            busyId={busyId}
            onDecide={decide}
          />
        ))}
    </div>
  );
}
