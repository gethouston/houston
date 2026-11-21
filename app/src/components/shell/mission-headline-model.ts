import { ARCHIVED_STATUS } from "../../lib/mission-selection.ts";

export type HeadlineStatus = "needs_you" | "running" | "done" | "idle";

export interface MissionHeadline {
  title: string;
  updatedAt: string;
  status: HeadlineStatus;
}

export interface HeadlineRow {
  status?: string | null;
  title?: string;
  updated_at?: string;
}

export interface HeadlineTracker {
  note(row: HeadlineRow): void;
  headline(): MissionHeadline | null;
}

function statusOf(raw: string | null | undefined): HeadlineStatus {
  if (raw === "needs_you" || raw === "running" || raw === "done") return raw;
  return "idle";
}

function later(
  current: MissionHeadline | null,
  next: MissionHeadline,
): MissionHeadline {
  if (!current) return next;
  return Date.parse(current.updatedAt) >= Date.parse(next.updatedAt)
    ? current
    : next;
}

export function createHeadlineTracker(): HeadlineTracker {
  const newest: Partial<
    Record<"needs_you" | "running" | "any", MissionHeadline>
  > = {};
  return {
    note(row) {
      if (row.status === ARCHIVED_STATUS) return;
      const title = row.title?.trim() ?? "";
      if (!row.updated_at) return;
      if (!title && row.status !== "running") return;
      if (Number.isNaN(Date.parse(row.updated_at))) return;
      const candidate: MissionHeadline = {
        title,
        updatedAt: row.updated_at,
        status: statusOf(row.status),
      };
      newest.any = later(newest.any ?? null, candidate);
      if (candidate.status === "needs_you" || candidate.status === "running") {
        const kind = candidate.status;
        newest[kind] = later(newest[kind] ?? null, candidate);
      }
    },
    headline() {
      return newest.running ?? newest.needs_you ?? newest.any ?? null;
    },
  };
}
