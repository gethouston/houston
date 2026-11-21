import { type HttpScope, httpRequest } from "../http";

export interface AuditEntry {
  id: number;
  orgId: string;
  actor: string;
  action: string;
  agentSlug?: string;
  subject: unknown;
  createdAt: number;
}

export interface UsageRow {
  agentSlug: string;
  userId: string;
  day: string;
  messages: number;
}

export interface ComputeUsageRow {
  agentSlug: string;
  day: string;
  awakeMs: number;
  activeMs: number;
  wakes: number;
  turns: number;
  routineRuns: number;
}

export interface ComputeUsage {
  asOf: string;
  awakeNow: string[];
  rows: ComputeUsageRow[];
}

/**
 * Shows the record of who did what in this space, newest first.
 * @param before The instant to read back from, in epoch milliseconds; omitted
 *   starts at the newest entry.
 * @param limit How many entries to read; omitted takes the host's own page size.
 * @assistant group:org
 * @assistant unschematized: an audit entry's subject varies per event type and carries the changed record verbatim.
 */
export async function orgAudit(
  scope: HttpScope,
  before?: number,
  limit?: number,
): Promise<AuditEntry[]> {
  const q = new URLSearchParams();
  if (before !== undefined) q.set("before", before.toString());
  if (limit !== undefined) q.set("limit", limit.toString());
  const suffix = q.toString();
  const res = await httpRequest(
    scope,
    `/v1/org/audit${suffix ? `?${suffix}` : ""}`,
  );
  return ((await res.json()) as { entries: AuditEntry[] }).entries;
}

/**
 * Shows how much each person and agent used this space over recent days.
 * @param days How many days back to count, ending today.
 * @assistant group:org
 */
export async function orgUsage(
  scope: HttpScope,
  days: number,
): Promise<UsageRow[]> {
  const res = await httpRequest(
    scope,
    `/v1/org/usage?days=${encodeURIComponent(days.toString())}`,
  );
  return ((await res.json()) as { rows: UsageRow[] }).rows;
}

/**
 * Shows how much running time each agent used over recent days.
 * @param days How many days back to count, ending today.
 * @assistant group:org
 */
export async function computeUsage(
  scope: HttpScope,
  days: number,
): Promise<ComputeUsage> {
  const res = await httpRequest(
    scope,
    `/v1/org/compute-usage?days=${encodeURIComponent(days.toString())}`,
  );
  return (await res.json()) as ComputeUsage;
}
