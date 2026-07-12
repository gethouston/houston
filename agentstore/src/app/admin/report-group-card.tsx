"use client";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@houston-ai/core";
import { ExternalLink } from "lucide-react";
import type { AdminReport } from "@/lib/store-admin-client";

const REASON_LABEL: Record<AdminReport["reason"], string> = {
  spam: "Spam",
  malicious: "Malicious",
  impersonation: "Impersonation",
  inappropriate: "Inappropriate",
  other: "Other",
};

export interface AgentGroup {
  agentId: string;
  agentSlug: string | null;
  reports: AdminReport[];
}

/** One agent's card in the reports feed: its reports, each with resolve/dismiss
 *  when still open. Presentational; the parent owns the decision requests. */
export function ReportGroupCard({
  group,
  busyId,
  onDecide,
}: {
  group: AgentGroup;
  busyId: string | null;
  onDecide: (id: string, action: "resolve" | "dismiss") => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          {group.agentSlug ? (
            <a
              href={`/a/${group.agentSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 underline underline-offset-4 hover:text-muted-foreground"
            >
              {group.agentSlug}{" "}
              <ExternalLink aria-hidden className="size-3.5" />
            </a>
          ) : (
            <span className="font-mono text-sm">{group.agentId}</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {group.reports.map((report) => (
          <div
            key={report.id}
            className="flex flex-col gap-2 rounded-lg border border-border/60 p-3"
          >
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{REASON_LABEL[report.reason]}</Badge>
              <span className="text-xs text-muted-foreground">
                {new Date(report.createdAt).toLocaleString()}
              </span>
            </div>
            {report.details && (
              <p className="text-sm text-foreground/90">{report.details}</p>
            )}
            {report.contact && (
              <p className="text-xs text-muted-foreground">
                Contact: {report.contact}
              </p>
            )}
            {report.status === "open" && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={busyId === report.id}
                  onClick={() => onDecide(report.id, "resolve")}
                >
                  Resolve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === report.id}
                  onClick={() => onDecide(report.id, "dismiss")}
                >
                  Dismiss
                </Button>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
